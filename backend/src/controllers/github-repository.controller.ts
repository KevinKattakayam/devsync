import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { encryptSecret } from '../services/secret.service';

export const connectRepositorySchema = z.object({
  repositoryId: z.string().min(1), owner: z.string().min(1), name: z.string().min(1),
  installationId: z.string().optional(), webhookSecret: z.string().min(16),
  prOpenedColumnId: z.string().optional().nullable(), prMergedColumnId: z.string().optional().nullable(),
});
export const updateRepositorySchema = connectRepositorySchema.partial().omit({ repositoryId: true });

async function validateColumn(workspaceId: string, columnId?: string | null) {
  if (!columnId) return;
  const column = await prisma.column.findUnique({ where: { id: columnId }, include: { board: true } });
  if (!column || column.board.workspaceId !== workspaceId) throw new Error('Workflow column must belong to this workspace');
}

async function requireRepositoryWorkspace(workspaceId: string, repositoryId: string) {
  const repository = await prisma.gitHubRepository.findFirst({ where: { id: repositoryId, workspaceId } });
  if (!repository) throw new Error('Repository connection not found');
  return repository;
}

export async function listRepositories(req: Request, res: Response, next: NextFunction) {
  try { res.json(await prisma.gitHubRepository.findMany({ where: { workspaceId: String(req.params.id) }, select: { id: true, repositoryId: true, owner: true, name: true, installationId: true, prOpenedColumnId: true, prMergedColumnId: true, createdAt: true } })); }
  catch (error) { next(error); }
}

export async function connectRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id); await validateColumn(workspaceId, req.body.prOpenedColumnId); await validateColumn(workspaceId, req.body.prMergedColumnId);
    const repository = await prisma.gitHubRepository.create({ data: { ...req.body, webhookSecret: encryptSecret(req.body.webhookSecret), workspaceId } });
    res.status(201).json({ ...repository, webhookSecret: undefined });
  } catch (error) { next(error); }
}

export async function updateRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id); const repositoryId = String(req.params.repositoryId); await requireRepositoryWorkspace(workspaceId, repositoryId); await validateColumn(workspaceId, req.body.prOpenedColumnId); await validateColumn(workspaceId, req.body.prMergedColumnId);
    const repository = await prisma.gitHubRepository.update({ where: { id: repositoryId }, data: { ...req.body, ...(req.body.webhookSecret ? { webhookSecret: encryptSecret(req.body.webhookSecret) } : {}) } });
    res.json({ ...repository, webhookSecret: undefined });
  } catch (error) { next(error); }
}

export async function disconnectRepository(req: Request, res: Response, next: NextFunction) {
  try { const workspaceId = String(req.params.id); const repositoryId = String(req.params.repositoryId); await requireRepositoryWorkspace(workspaceId, repositoryId); await prisma.gitHubRepository.delete({ where: { id: repositoryId } }); res.status(204).end(); }
  catch (error) { next(error); }
}
