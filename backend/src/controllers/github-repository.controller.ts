import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { OWNER_ROLES, READ_ROLES, withWorkspaceAccess } from '../security/workspace-policy';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { encryptSecret } from '../services/secret.service';

export const connectRepositorySchema = z.object({
  repositoryId: z.string().min(1).max(191),
  owner: z.string().min(1).max(191),
  name: z.string().min(1).max(191),
  installationId: z.string().max(191).optional(),
  webhookSecret: z.string().min(16).max(4096),
  prOpenedColumnId: z.string().min(1).max(191).optional().nullable(),
  prMergedColumnId: z.string().min(1).max(191).optional().nullable(),
});
export const updateRepositorySchema = connectRepositorySchema
  .partial()
  .omit({ repositoryId: true });

async function validateColumn(
  tx: TenantTransaction,
  workspaceId: string,
  columnId?: string | null,
) {
  if (!columnId) return;
  const column = await tx.column.findUnique({
    where: { id: columnId },
    include: { board: true },
  });
  if (!column || column.board.workspaceId !== workspaceId)
    throw new ForbiddenError('Access denied');
}

async function requireRepositoryWorkspace(
  tx: TenantTransaction,
  workspaceId: string,
  repositoryId: string,
) {
  const repository = await tx.gitHubRepository.findFirst({
    where: { id: repositoryId, workspaceId },
  });
  if (!repository) throw new NotFoundError('Repository connection not found');
  return repository;
}

const repositorySelect = {
  id: true,
  repositoryId: true,
  owner: true,
  name: true,
  installationId: true,
  prOpenedColumnId: true,
  prMergedColumnId: true,
  createdAt: true,
};
export async function listRepositories(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id);
    res.json(
      await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
        tx.gitHubRepository.findMany({ where: { workspaceId }, select: repositorySelect }),
      ),
    );
  } catch (error) {
    next(error);
  }
}
export async function connectRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id),
      data = connectRepositorySchema.parse(req.body);
    const repository = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        await validateColumn(tx, workspaceId, data.prOpenedColumnId);
        await validateColumn(tx, workspaceId, data.prMergedColumnId);
        return tx.gitHubRepository.create({
          data: { ...data, webhookSecret: encryptSecret(data.webhookSecret), workspaceId },
        });
      },
    );
    res.status(201).json({ ...repository, webhookSecret: undefined });
  } catch (error) {
    next(error);
  }
}
export async function updateRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id),
      repositoryId = String(req.params.repositoryId),
      data = updateRepositorySchema.parse(req.body);
    const repository = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        await requireRepositoryWorkspace(tx, workspaceId, repositoryId);
        await validateColumn(tx, workspaceId, data.prOpenedColumnId);
        await validateColumn(tx, workspaceId, data.prMergedColumnId);
        return tx.gitHubRepository.update({
          where: { id: repositoryId, workspaceId },
          data: {
            ...data,
            ...(data.webhookSecret ? { webhookSecret: encryptSecret(data.webhookSecret) } : {}),
          },
        });
      },
    );
    res.json({ ...repository, webhookSecret: undefined });
  } catch (error) {
    next(error);
  }
}
export async function disconnectRepository(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.id),
      repositoryId = String(req.params.repositoryId);
    await withWorkspaceAccess(req.user!.userId, workspaceId, OWNER_ROLES, async (tx) => {
      await requireRepositoryWorkspace(tx, workspaceId, repositoryId);
      await tx.gitHubRepository.delete({ where: { id: repositoryId, workspaceId } });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
