import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { cache, CacheKeys } from '../lib/cache';
import { queueEmbedding } from '../services/embedding.service';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const SNIPPET_CACHE_TTL = 300; // 5 minutes

async function requireSnippetEditor(userId: string, snippetId: string) {
  const snippet = await prisma.snippet.findUnique({
    where: { id: snippetId },
    select: { workspaceId: true },
  });
  if (!snippet) throw new NotFoundError('Snippet not found');
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: snippet.workspaceId } },
  });
  if (!member || member.role === 'VIEWER')
    throw new ForbiddenError('Requires EDITOR or OWNER role');
  return snippet;
}

export const createSnippetSchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().min(1),
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

    // Check Redis cache first
    const cacheKey = CacheKeys.snippetList(workspaceId);
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const snippets = await prisma.withTenantTransaction(workspaceId, (tx) =>
      tx.snippet.findMany({
        where: { workspaceId },
        include: { author: { select: { id: true, name: true, avatar: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    );

    // Populate cache
    await cache.set(cacheKey, snippets, SNIPPET_CACHE_TTL);

    res.json(snippets);
  } catch (error) {
    next(error);
  }
}

export async function createSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const { title, code, language, description } = req.body;
    const snippet = await prisma.withTenantTransaction(workspaceId, (tx) =>
      tx.snippet.create({
        data: { title, code, language, description, authorId: req.user!.userId, workspaceId },
        include: { author: { select: { id: true, name: true, avatar: true } } },
      }),
    );
    await prisma.activity.create({
      data: {
        type: 'snippet_created',
        message: `added snippet "${title}"`,
        userId: req.user!.userId,
        workspaceId,
      },
    });

    // Invalidate workspace snippet list cache
    await cache.del(CacheKeys.snippetList(workspaceId));

    res.status(201).json(snippet);
    queueEmbedding('snippet', snippet.id);
  } catch (error) {
    next(error);
  }
}

export async function updateSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    const { workspaceId } = await requireSnippetEditor(req.user!.userId, snippetId);
    const { title, code, language, description } = req.body;
    const snippet = await prisma.snippet.update({
      where: { id: snippetId },
      data: {
        ...(title && { title }),
        ...(code && { code }),
        ...(language && { language }),
        ...(description !== undefined && { description }),
      },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    });

    // Invalidate both individual snippet and workspace list caches
    await Promise.all([
      cache.del(CacheKeys.snippet(snippetId)),
      cache.del(CacheKeys.snippetList(workspaceId)),
    ]);

    res.json(snippet);
    queueEmbedding('snippet', snippet.id);
  } catch (error) {
    next(error);
  }
}

export async function deleteSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    const { workspaceId } = await requireSnippetEditor(req.user!.userId, snippetId);
    await prisma.snippet.delete({ where: { id: snippetId } });

    // Invalidate caches
    await Promise.all([
      cache.del(CacheKeys.snippet(snippetId)),
      cache.del(CacheKeys.snippetList(workspaceId)),
    ]);

    res.json({ message: 'Snippet deleted' });
  } catch (error) {
    next(error);
  }
}

/** E01: retain the endpoint contract, fail closed until an isolated executor exists. */
export async function executeSnippet(_req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'Code execution is unavailable' });
}
