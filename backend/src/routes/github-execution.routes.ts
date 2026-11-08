import { Router, type RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { withWorkspaceAccess, OWNER_ROLES } from '../security/workspace-policy';
import { NotFoundError } from '../utils/errors';
import { githubExecutionSchema } from '../services/github-execution';
export function createGitHubExecutionRouter(authenticate: RequestHandler = authMiddleware) {
  const githubExecutionRouter = Router({ mergeParams: true });
  githubExecutionRouter.use(authenticate);
  githubExecutionRouter.get<{ workspaceId: string; repositoryId: string }>(
    '/',
    async (req, res, next) => {
      try {
        const workspaceId = String(req.params.workspaceId),
          repositoryId = String(req.params.repositoryId);
        const records = await withWorkspaceAccess(
          req.user!.userId,
          workspaceId,
          OWNER_ROLES,
          async (tx) => {
            const repository = await tx.gitHubRepository.findFirst({
              where: { id: repositoryId, workspaceId },
              select: { id: true, providerDisconnectedAt: true },
            });
            if (!repository) throw new NotFoundError('Repository unavailable');
            if (repository.providerDisconnectedAt)
              return { items: [], liveAccess: 'disconnected' as const };
            const items = await tx.$queryRaw<
              unknown[]
            >`SELECT * FROM "GitHubExecutionState" WHERE "workspaceId"=${workspaceId} AND "repositoryId"=${repositoryId} ORDER BY "observedAt" DESC,kind,subject LIMIT 100`;
            return { items, liveAccess: 'not_verified' as const };
          },
        );
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          items: records.items.map((r) => githubExecutionSchema.parse(r)),
          liveAccess: records.liveAccess,
          deployment: 'unknown',
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return githubExecutionRouter;
}
export const githubExecutionRouter = createGitHubExecutionRouter();
