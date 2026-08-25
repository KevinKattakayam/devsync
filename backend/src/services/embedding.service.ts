import { createHash } from 'crypto';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

function textFromJson(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromJson).join(' ');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(textFromJson).join(' ');
  return '';
}

async function embed(text: string) {
  if (!client || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy') return null;
  try {
    const result = await client.embeddings.create({ model, input: text.slice(0, 30000) });
    return result.data[0]?.embedding ?? null;
  } catch (error) {
    console.warn('[Embedding] Failed to generate embedding (graceful fallback):', (error as any)?.message || error);
    return null;
  }
}

function vector(values: number[]) { return Prisma.raw(`'[${values.join(',')}]'::vector`); }

export async function queueEmbedding(kind: 'document' | 'snippet' | 'task', id: string) {
  await prisma.$executeRaw`INSERT INTO "EmbeddingJob" ("id", "resourceType", "resourceId", "status", "attempts", "runAfter", "createdAt", "updatedAt") VALUES (${`${kind}:${id}`}, ${kind}, ${id}, 'pending', 0, NOW(), NOW(), NOW()) ON CONFLICT ("resourceType", "resourceId") DO UPDATE SET "status" = 'pending', "runAfter" = NOW(), "lastError" = NULL, "updatedAt" = NOW()`;
}

let workerRunning = false;
export async function processEmbeddingJobs() {
  if (workerRunning || !client) return;
  workerRunning = true;
  try {
    const jobs = await prisma.$queryRaw<{ id: string; resourceType: string; resourceId: string; attempts: number }[]>`SELECT "id", "resourceType", "resourceId", "attempts" FROM "EmbeddingJob" WHERE "status" = 'pending' AND "runAfter" <= NOW() ORDER BY "runAfter" ASC LIMIT 10`;
    for (const job of jobs) {
      await prisma.$executeRaw`UPDATE "EmbeddingJob" SET "status" = 'processing', "attempts" = "attempts" + 1, "updatedAt" = NOW() WHERE "id" = ${job.id}`;
      try {
        await refreshEmbedding(job.resourceType as 'document' | 'snippet' | 'task', job.resourceId);
        await prisma.$executeRaw`DELETE FROM "EmbeddingJob" WHERE "id" = ${job.id}`;
      } catch (error) {
        const delay = Math.min(60, 2 ** Math.min(job.attempts + 1, 6));
        await prisma.$executeRaw`UPDATE "EmbeddingJob" SET "status" = 'pending', "lastError" = ${error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error'}, "runAfter" = ${new Date(Date.now() + delay * 60_000)}, "updatedAt" = NOW() WHERE "id" = ${job.id}`;
      }
    }
  } finally { workerRunning = false; }
}

export async function refreshEmbedding(kind: 'document' | 'snippet' | 'task', id: string) {
  if (!client) return;
  if (kind === 'document') {
    const item = await prisma.document.findUnique({ where: { id } });
    if (!item) return;
    const text = `${item.title}\n${textFromJson(item.content)}`.trim();
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash === item.embeddingHash) return;
    const values = await embed(text); if (!values) return;
    await prisma.$executeRaw`UPDATE "Document" SET "embedding" = ${vector(values)}, "embeddingHash" = ${hash} WHERE "id" = ${id}`;
  } else if (kind === 'snippet') {
    const item = await prisma.snippet.findUnique({ where: { id } });
    if (!item) return;
    const text = `${item.title}\n${item.description || ''}\n${item.language}\n${item.code}`.trim();
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash === item.embeddingHash) return;
    const values = await embed(text); if (!values) return;
    await prisma.$executeRaw`UPDATE "Snippet" SET "embedding" = ${vector(values)}, "embeddingHash" = ${hash} WHERE "id" = ${id}`;
  } else {
    const item = await prisma.task.findUnique({ where: { id } });
    if (!item) return;
    const text = `${item.taskKey || ''} ${item.title}\n${item.description || ''}`.trim();
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash === item.embeddingHash) return;
    const values = await embed(text); if (!values) return;
    await prisma.$executeRaw`UPDATE "Task" SET "embedding" = ${vector(values)}, "embeddingHash" = ${hash} WHERE "id" = ${id}`;
  }
}

export async function semanticWorkspaceContext(workspaceId: string, query: string, limit = 6) {
  try {
    const values = await embed(query);
    if (!values) return [];
    return await prisma.$queryRaw<{ type: string; title: string; body: string; score: number }[]>`
      SELECT * FROM (
        SELECT 'document' AS type, d.title, COALESCE(d.content::text, '') AS body, 1 - (d.embedding <=> ${vector(values)}) AS score
        FROM "Document" d WHERE d."workspaceId" = ${workspaceId} AND d.embedding IS NOT NULL
        UNION ALL
        SELECT 'snippet', s.title, concat_ws(E'\n', s.description, s.code), 1 - (s.embedding <=> ${vector(values)})
        FROM "Snippet" s WHERE s."workspaceId" = ${workspaceId} AND s.embedding IS NOT NULL
        UNION ALL
        SELECT 'task', t.title, COALESCE(t.description, ''), 1 - (t.embedding <=> ${vector(values)})
        FROM "Task" t JOIN "Column" c ON t."columnId" = c.id JOIN "Board" b ON c."boardId" = b.id
        WHERE b."workspaceId" = ${workspaceId} AND t.embedding IS NOT NULL
      ) context ORDER BY score DESC LIMIT ${limit}`;
  } catch (error) {
    console.warn('[Embedding] Semantic workspace context query skipped:', (error as any)?.message || error);
    return [];
  }
}
