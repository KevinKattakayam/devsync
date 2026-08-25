import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { semanticWorkspaceContext } from '../services/embedding.service';

export const workspaceSearchSchema = z.object({
  q: z.string().trim().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/** Unified, tenant-scoped search. Semantic results are preferred; the keyword
 * fallback keeps search useful before an embedding provider is configured. */
export async function workspaceSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    const { q, limit } = workspaceSearchSchema.parse(req.query);
    const semantic = await semanticWorkspaceContext(workspaceId, q, limit);
    if (semantic.length) return res.json({ mode: 'semantic', results: semantic });

    const contains = { contains: q, mode: 'insensitive' as const };
    const [documents, snippets, tasks] = await Promise.all([
      prisma.document.findMany({ where: { workspaceId, isArchived: false, OR: [{ title: contains }, { content: { string_contains: q } }] }, select: { id: true, title: true, updatedAt: true }, take: limit }),
      prisma.snippet.findMany({ where: { workspaceId, OR: [{ title: contains }, { description: contains }, { code: contains }] }, select: { id: true, title: true, description: true, updatedAt: true }, take: limit }),
      prisma.task.findMany({ where: { column: { board: { workspaceId } }, OR: [{ title: contains }, { taskKey: contains }, { description: contains }] }, select: { id: true, title: true, taskKey: true, updatedAt: true }, take: limit }),
    ]);
    res.json({ mode: 'keyword', results: [
      ...documents.map(item => ({ type: 'document', ...item })),
      ...snippets.map(item => ({ type: 'snippet', ...item })),
      ...tasks.map(item => ({ type: 'task', ...item })),
    ].slice(0, limit) });
  } catch (error) { next(error); }
}
