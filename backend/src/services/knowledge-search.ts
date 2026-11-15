import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withWorkspaceAccess, READ_ROLES } from '../security/workspace-policy';
import { NotFoundError } from '../utils/errors';
import { redactSnippetText } from '../security/snippet-preflight';
export const knowledgeType = z.enum(['document', 'task', 'snippet', 'decision', 'pull_request']);
export const knowledgeQuery = z
  .object({
    q: z.string().trim().min(2).max(500),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    type: knowledgeType.optional(),
    assigneeId: z.string().min(1).max(191).optional(),
    after: z.iso.datetime({ offset: true }).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((v) => !v.after || !v.before || new Date(v.after) <= new Date(v.before), {
    message: 'Invalid time range',
  });
export const knowledgeSourceQuery = z
  .object({ type: knowledgeType, id: z.string().min(1).max(400) })
  .strict();
export const knowledgeItem = z
  .object({
    type: knowledgeType,
    id: z.string(),
    title: z.string(),
    preview: z.string(),
    updatedAt: z.iso.datetime(),
    indexedAt: z.iso.datetime(),
    freshness: z.literal('current_projection'),
    method: z.literal('lexical'),
    href: z.string(),
    score: z.number(),
  })
  .strict();
export const knowledgePage = z
  .object({
    results: z.array(knowledgeItem),
    retrievedAt: z.iso.datetime(),
    semantic: z.literal('not_requested'),
  })
  .strict();
type Row = {
  type: z.infer<typeof knowledgeType>;
  id: string;
  title: string;
  body: string;
  updatedAt: Date;
  assigneeId: string | null;
  score: number;
};
/** No derivative content cache: every call applies current policy and source visibility in RLS. */
export async function searchKnowledge(
  actorId: string,
  workspaceId: string,
  input: z.infer<typeof knowledgeQuery> | z.infer<typeof knowledgeSourceQuery>,
) {
  return withWorkspaceAccess(actorId, workspaceId, READ_ROLES, async (tx) => {
    const member = await tx.workspaceMember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: actorId, workspaceId } },
    });
    const opening = 'id' in input;
    const query = opening
      ? Prisma.sql`true`
      : Prisma.sql`to_tsvector('simple', title || E'\n' || body) @@ websearch_to_tsquery('simple', ${input.q})`;
    const rows = await tx.$queryRaw<Row[]>`
      WITH sources AS (
        SELECT 'document'::text AS type, d.id, d.title, devsync_document_text(d.content) AS body, d."updatedAt" AT TIME ZONE 'UTC' AS "updatedAt", NULL::text AS "assigneeId"
        FROM "Document" d WHERE d."workspaceId"=${workspaceId} AND NOT d."isArchived"
        UNION ALL
        SELECT 'snippet', s.id, s.title, COALESCE(s.description,'') || E'\n' || s.code, s."updatedAt" AT TIME ZONE 'UTC', NULL::text FROM "Snippet" s WHERE s."workspaceId"=${workspaceId}
        UNION ALL
        SELECT 'task', t.id, t.title, COALESCE(t."taskKey",'') || E'\n' || COALESCE(t.description,''), t."updatedAt" AT TIME ZONE 'UTC', t."assigneeId"
        FROM "Task" t JOIN "Column" c ON c.id=t."columnId" JOIN "Board" b ON b.id=c."boardId" WHERE b."workspaceId"=${workspaceId}
        UNION ALL
        SELECT 'decision', r.id, r.title, r.rationale || E'\n' || r.excerpt, r."updatedAt" AT TIME ZONE 'UTC', NULL::text
        FROM "DecisionReceipt" r WHERE r."workspaceId"=${workspaceId} AND ${process.env.FEATURE_DECISION_RECEIPTS === 'true'} AND (
          (r."sourceKind"='document' AND EXISTS(SELECT 1 FROM "Document" d WHERE d.id=r."sourceId" AND d."workspaceId"=${workspaceId} AND NOT d."isArchived")) OR
          (r."sourceKind"='task' AND EXISTS(SELECT 1 FROM "Task" t JOIN "Column" c ON c.id=t."columnId" JOIN "Board" b ON b.id=c."boardId" WHERE t.id=r."sourceId" AND b."workspaceId"=${workspaceId}))
        )
        UNION ALL
        SELECT 'pull_request', g.id || ':' || e.subject, g.owner || '/' || g.name || ' #' || e.subject,
          concat_ws(' ',g.owner,g.name,e.state,e."headSha"),e."observedAt",NULL::text
        FROM "GitHubExecutionState" e JOIN "GitHubRepository" g ON g.id=e."repositoryId" AND g."workspaceId"=e."workspaceId"
        WHERE e."workspaceId"=${workspaceId} AND e.kind='pull_request' AND g."providerDisconnectedAt" IS NULL AND ${member.role === 'OWNER'}
      )
      SELECT *, ${opening ? Prisma.sql`0::float8` : Prisma.sql`ts_rank(to_tsvector('simple',title || E'\n' || body),websearch_to_tsquery('simple',${input.q}))::float8`} AS score
      FROM sources WHERE ${query}
        ${input.type ? Prisma.sql`AND type=${input.type}` : Prisma.empty}
        ${opening ? Prisma.sql`AND id=${input.id}` : Prisma.empty}
        ${!opening && input.assigneeId ? Prisma.sql`AND type='task' AND "assigneeId"=${input.assigneeId}` : Prisma.empty}
        ${!opening && input.after ? Prisma.sql`AND "updatedAt">=${input.after}::timestamptz` : Prisma.empty}
        ${!opening && input.before ? Prisma.sql`AND "updatedAt"<=${input.before}::timestamptz` : Prisma.empty}
      ORDER BY score DESC,"updatedAt" DESC,type,id LIMIT ${opening ? 1 : input.limit}`;
    const retrievedAt = new Date().toISOString();
    const results = rows.map((row) => {
      let title = row.title,
        body = row.body;
      if (row.type === 'snippet' && process.env.FEATURE_SNIPPET_SAFETY === 'true') {
        title = redactSnippetText(title).text;
        body = redactSnippetText(body).text;
      }
      const root = `/workspace/${encodeURIComponent(workspaceId)}`;
      let href =
        row.type === 'document'
          ? `${root}/docs/${encodeURIComponent(row.id)}`
          : row.type === 'task'
            ? `${root}/kanban`
            : row.type === 'snippet'
              ? `${root}/snippets`
              : `${root}/decisions`;
      if (row.type === 'pull_request') {
        const split = row.id.lastIndexOf(':');
        const repository = row.title.slice(0, row.title.lastIndexOf(' #'));
        href = `https://github.com/${repository.split('/').map(encodeURIComponent).join('/')}/pull/${encodeURIComponent(row.id.slice(split + 1))}`;
      }
      return {
        type: row.type,
        id: row.id,
        title,
        preview: body.slice(0, 320),
        updatedAt: row.updatedAt.toISOString(),
        indexedAt: retrievedAt,
        freshness: 'current_projection' as const,
        method: 'lexical' as const,
        href,
        score: row.score,
      };
    });
    if (opening && !results.length) throw new NotFoundError('Source unavailable');
    return { results, retrievedAt, semantic: 'not_requested' as const };
  });
}
