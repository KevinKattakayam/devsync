import { createHash, randomUUID } from 'crypto';
import OpenAI from 'openai';
import { boundedProvider, rejectedBeforeAdmission } from './ai-provider';
import { preflightSnippet, redactSnippetText } from '../security/snippet-preflight';
import { AiQuota } from './ai-quota';
import { redis } from '../lib/redis';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  authorizeWorkspace,
  READ_ROLES,
  WRITE_ROLES,
  withWorkspaceAccess,
} from '../security/workspace-policy';
import { EmbeddingKind, withEmbeddingAccess } from '../security/service-policy';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { AppError, ConflictError, ForbiddenError } from '../utils/errors';
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10000, maxRetries: 0 })
  : null;
const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const vectorSchema = z.array(z.number().finite()).length(1536);
export type EmbeddingProvider = (text: string) => Promise<number[] | null>;
function textFromJson(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromJson).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textFromJson).join(' ');
  return '';
}
async function embed(text: string, actorId: string, workspaceId: string) {
  if (!client) return null;
  const release = await new AiQuota(redis).acquire(actorId, workspaceId);
  let refund = false;
  try {
    const result = await boundedProvider((signal) =>
      client.embeddings.create({ model, input: text.slice(0, 30000) }, { signal }),
    );
    return vectorSchema.parse(result.data[0]?.embedding);
  } catch (error) {
    refund = rejectedBeforeAdmission(error);
    console.warn('[Embedding] Provider unavailable');
    return null;
  } finally {
    await release(refund).catch(() => undefined);
  }
}
function vector(values: number[]) {
  return Prisma.sql`${JSON.stringify(values)}::vector`;
}

export async function queueEmbedding(
  kind: EmbeddingKind,
  id: string,
  tx: TenantTransaction,
  workspaceId: string,
  actorId: string,
) {
  const [scope] = await tx.$queryRaw<
    { tenant: string | null }[]
  >`SELECT current_setting('app.current_tenant_id', true) AS tenant`;
  if (scope?.tenant !== workspaceId) throw new ForbiddenError('Access denied');
  await authorizeWorkspace(actorId, workspaceId, WRITE_ROLES, tx);
  const resource =
    kind === 'document'
      ? await tx.document.findUnique({ where: { id, workspaceId }, select: { id: true } })
      : kind === 'snippet'
        ? await tx.snippet.findUnique({ where: { id, workspaceId }, select: { id: true } })
        : await tx.task.findFirst({
            where: { id, column: { board: { workspaceId } } },
            select: { id: true },
          });
  if (!resource) throw new ForbiddenError('Access denied');
  await tx.$executeRaw`INSERT INTO "EmbeddingJob" ("id", "resourceType", "resourceId", "workspaceId", "status", "attempts", "runAfter", "createdAt", "updatedAt") VALUES (${`${kind}:${id}`}, ${kind}, ${id}, ${workspaceId}, 'pending', 0, NOW(), NOW(), NOW()) ON CONFLICT ("resourceType", "resourceId") DO UPDATE SET "workspaceId"=EXCLUDED."workspaceId", "revision"="EmbeddingJob"."revision"+1, "status"='pending', "attempts"=0, "leaseToken"=NULL, "leaseUntil"=NULL, "runAfter"=NOW(), "lastError"=NULL, "updatedAt"=NOW()`;
}
export interface EmbeddingClaim {
  id: string;
  resourceType: string;
  resourceId: string;
  workspaceId: string;
  revision: number;
  leaseToken: string;
  attempts: number;
}
/** Private scheduler capability: lease metadata only; document access needs withEmbeddingAccess. */
export async function claimEmbeddingJobs(leaseMs = 120000): Promise<EmbeddingClaim[]> {
  const token = randomUUID();
  return prisma.$queryRaw<EmbeddingClaim[]>`WITH candidates AS (
    SELECT id FROM "EmbeddingJob" WHERE "workspaceId" IS NOT NULL AND ((status='pending' AND "runAfter"<=NOW()) OR (status='processing' AND "leaseUntil"<NOW())) ORDER BY "runAfter",id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE "EmbeddingJob" j SET status='processing', attempts=attempts+1, "leaseToken"=${token}, "leaseUntil"=NOW()+(${Math.max(50, Math.min(120000, leaseMs))} * INTERVAL '1 millisecond'), "updatedAt"=NOW() FROM candidates c WHERE j.id=c.id RETURNING j.id,j."resourceType",j."resourceId",j."workspaceId",j.revision,j."leaseToken",j.attempts`;
}
export async function acknowledgeEmbeddingJob(job: EmbeddingClaim) {
  return prisma.embeddingJob.deleteMany({
    where: {
      id: job.id,
      workspaceId: job.workspaceId,
      revision: job.revision,
      leaseToken: job.leaseToken,
    },
  });
}
async function retryEmbeddingJob(job: EmbeddingClaim, error: unknown) {
  return prisma.embeddingJob.updateMany({
    where: {
      id: job.id,
      workspaceId: job.workspaceId,
      revision: job.revision,
      leaseToken: job.leaseToken,
    },
    data: {
      status: job.attempts >= 5 ? 'dead' : 'pending',
      leaseToken: null,
      leaseUntil: null,
      runAfter: new Date(Date.now() + Math.min(60, 2 ** Math.min(job.attempts, 6)) * 60000),
      lastError: error instanceof Error ? error.name : 'UnknownError',
    },
  });
}
let workerRunning = false;
export async function processEmbeddingJobs(provider?: EmbeddingProvider) {
  if (workerRunning || (!provider && !client)) return;
  workerRunning = true;
  try {
    for (const job of await claimEmbeddingJobs()) {
      try {
        const kind = z.enum(['document', 'snippet', 'task']).parse(job.resourceType);
        if (!(await refreshEmbedding(kind, job.resourceId, job.workspaceId, provider)))
          throw new AppError('Embedding unavailable', 503);
        await acknowledgeEmbeddingJob(job);
      } catch (error) {
        await retryEmbeddingJob(job, error);
      }
    }
  } finally {
    workerRunning = false;
  }
}
async function embeddingText(tx: TenantTransaction, kind: EmbeddingKind, id: string) {
  if (kind === 'document') {
    const item = await tx.document.findUniqueOrThrow({ where: { id } });
    return {
      text: `${item.title}\n${textFromJson(item.content)}`.trim(),
      hash: item.embeddingHash,
    };
  }
  if (kind === 'snippet') {
    const stored = await tx.snippet.findUniqueOrThrow({ where: { id } });
    const item =
      process.env.FEATURE_SNIPPET_SAFETY === 'true'
        ? {
            ...stored,
            ...preflightSnippet({ ...stored, description: stored.description ?? undefined })
              .content,
          }
        : stored;
    return {
      text: `${item.title}\n${item.description || ''}\n${item.language}\n${item.code}`.trim(),
      hash: item.embeddingHash,
    };
  }
  const item = await tx.task.findUniqueOrThrow({ where: { id } });
  return {
    text: `${item.taskKey || ''} ${item.title}\n${item.description || ''}`.trim(),
    hash: item.embeddingHash,
  };
}
export async function refreshEmbedding(
  kind: EmbeddingKind,
  id: string,
  workspaceId: string,
  provider?: EmbeddingProvider,
): Promise<boolean> {
  const original = await withEmbeddingAccess(workspaceId, kind, id, (tx) =>
    embeddingText(tx, kind, id),
  );
  const hash = createHash('sha256').update(original.text).digest('hex');
  if (hash === original.hash) return true;
  const raw = provider
    ? await provider(original.text)
    : await embed(original.text, `service:embedding:${workspaceId}`, workspaceId);
  if (!raw) return false;
  const values = vectorSchema.parse(raw);
  await withEmbeddingAccess(workspaceId, kind, id, async (tx) => {
    const fresh = await embeddingText(tx, kind, id);
    if (createHash('sha256').update(fresh.text).digest('hex') !== hash)
      throw new ConflictError('Content changed during embedding');
    if (kind === 'document')
      await tx.$executeRaw`UPDATE "Document" SET embedding=${vector(values)}, "embeddingHash"=${hash} WHERE id=${id}`;
    else if (kind === 'snippet')
      await tx.$executeRaw`UPDATE "Snippet" SET embedding=${vector(values)}, "embeddingHash"=${hash} WHERE id=${id}`;
    else
      await tx.$executeRaw`UPDATE "Task" SET embedding=${vector(values)}, "embeddingHash"=${hash} WHERE id=${id}`;
  });
  return true;
}

export async function semanticWorkspaceContext(
  workspaceId: string,
  query: string,
  limit: number,
  actorId: string,
) {
  await authorizeWorkspace(actorId, workspaceId);
  try {
    const values = await embed(query, actorId, workspaceId);
    if (!values) return [];
    const results = await withWorkspaceAccess(
      actorId,
      workspaceId,
      READ_ROLES,
      (tx) => tx.$queryRaw<{ type: string; title: string; body: string; score: number }[]>`
      SELECT * FROM (
        SELECT 'document' AS type, d.title, COALESCE(d.content::text, '') AS body, 1 - (d.embedding <=> ${vector(values)}) AS score
        FROM "Document" d WHERE d."workspaceId" = ${workspaceId} AND d."isArchived" = false AND d.embedding IS NOT NULL
        UNION ALL
        SELECT 'snippet', s.title, concat_ws(E'\n', s.description, s.code), 1 - (s.embedding <=> ${vector(values)})
        FROM "Snippet" s WHERE s."workspaceId" = ${workspaceId} AND s.embedding IS NOT NULL
        UNION ALL
        SELECT 'task', t.title, COALESCE(t.description, ''), 1 - (t.embedding <=> ${vector(values)})
        FROM "Task" t JOIN "Column" c ON t."columnId" = c.id JOIN "Board" b ON c."boardId" = b.id
        WHERE b."workspaceId" = ${workspaceId} AND t.embedding IS NOT NULL
      ) context ORDER BY score DESC LIMIT ${Math.max(1, Math.min(20, limit))}`,
    );
    return process.env.FEATURE_SNIPPET_SAFETY === 'true'
      ? results.map((item) =>
          item.type === 'snippet'
            ? {
                ...item,
                title: redactSnippetText(item.title).text,
                body: redactSnippetText(item.body).text,
              }
            : item,
        )
      : results;
  } catch (error) {
    console.warn(
      '[Embedding] Semantic workspace context query skipped:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return [];
  }
}
