import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queueEmbedding } from '../services/embedding.service';
import {
  READ_ROLES,
  WRITE_ROLES,
  withResourceAccess,
  withWorkspaceAccess,
} from '../security/workspace-policy';

export const createSnippetSchema = z.object({
  title: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(256 * 1024),
  language: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
});

export const updateSnippetSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  code: z.string().min(1).optional(),
  language: z.string().min(1).max(50).optional(),
  description: z.string().max(1000).optional(),
});

export async function getSnippets(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const snippets = await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
      tx.snippet.findMany({
        where: { workspaceId },
        include: { author: { select: { id: true, name: true, avatar: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    res.json(snippets);
  } catch (error) {
    next(error);
  }
}

export async function createSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const data = createSnippetSchema.parse(req.body);
    const snippet = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      WRITE_ROLES,
      async (tx) => {
        const result = await tx.snippet.create({
          data: { ...data, authorId: req.user!.userId, workspaceId },
          include: { author: { select: { id: true, name: true, avatar: true } } },
        });
        await tx.activity.create({
          data: {
            type: 'snippet_created',
            message: `added snippet "${result.title}"`,
            userId: req.user!.userId,
            workspaceId,
          },
        });
        await queueEmbedding('snippet', result.id, tx);
        return result;
      },
    );
    res.status(201).json(snippet);
  } catch (error) {
    next(error);
  }
}

export async function updateSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    const data = updateSnippetSchema.parse(req.body);
    const snippet = await withResourceAccess(
      req.user!.userId,
      'snippet',
      snippetId,
      WRITE_ROLES,
      async (tx) => {
        const result = await tx.snippet.update({
          where: { id: snippetId },
          data,
          include: { author: { select: { id: true, name: true, avatar: true } } },
        });
        await queueEmbedding('snippet', result.id, tx);
        return result;
      },
    );
    res.json(snippet);
  } catch (error) {
    next(error);
  }
}

export async function deleteSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    await withResourceAccess(req.user!.userId, 'snippet', snippetId, WRITE_ROLES, (tx) =>
      tx.snippet.delete({ where: { id: snippetId } }),
    );
    res.json({ message: 'Snippet deleted' });
  } catch (error) {
    next(error);
  }
}

/** E01: retain the endpoint contract, fail closed until an isolated executor exists. */
export async function executeSnippet(_req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'Code execution is unavailable' });
}
