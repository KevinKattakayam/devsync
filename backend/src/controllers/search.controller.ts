import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { workspaceSearchSchema } from '../schemas/search.schema';
import { READ_ROLES, withWorkspaceAccess, authorizeWorkspace } from '../security/workspace-policy';
import { semanticWorkspaceContext } from '../services/embedding.service';

export { workspaceSearchSchema } from '../schemas/search.schema';

/** Unified, tenant-scoped search. Semantic results are preferred; the keyword
 * fallback keeps search useful before an embedding provider is configured. */
export async function workspaceSearch(req: Request, res: Response, next: NextFunction) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const workspaceId = String(req.params.id);
    const { q, limit } = workspaceSearchSchema.parse(req.query);
    await authorizeWorkspace(req.user!.userId, workspaceId);
    const semantic = await semanticWorkspaceContext(workspaceId, q, limit, req.user!.userId);
    if (semantic.length) return res.json({ mode: 'semantic', results: semantic });

    const contains = { contains: q, mode: 'insensitive' as const };
    const [documents, snippets, tasks] = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      READ_ROLES,
      (tx) =>
        Promise.all([
          tx.$queryRaw<{ id: string; title: string; updatedAt: Date }[]>(Prisma.sql`
            SELECT id,title,"updatedAt" FROM "Document" WHERE "workspaceId"=${workspaceId}
            AND NOT "isArchived" AND (title ILIKE ${'%' + q + '%'} OR devsync_document_text(content) ILIKE ${'%' + q + '%'})
            ORDER BY "updatedAt" DESC,id LIMIT ${limit}`),
          tx.snippet.findMany({
            where: {
              workspaceId,
              OR: [{ title: contains }, { description: contains }, { code: contains }],
            },
            select: { id: true, title: true, description: true, updatedAt: true },
            take: limit,
          }),
          tx.task.findMany({
            where: {
              column: { board: { workspaceId } },
              OR: [{ title: contains }, { taskKey: contains }, { description: contains }],
            },
            select: { id: true, title: true, taskKey: true, updatedAt: true },
            take: limit,
          }),
        ]),
    );
    res.json({
      mode: 'keyword',
      results: [
        ...documents.map((item) => ({ type: 'document', ...item })),
        ...snippets.map((item) => ({ type: 'snippet', ...item })),
        ...tasks.map((item) => ({ type: 'task', ...item })),
      ].slice(0, limit),
    });
  } catch (error) {
    next(error);
  }
}
