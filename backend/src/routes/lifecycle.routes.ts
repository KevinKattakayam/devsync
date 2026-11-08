import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  withPrincipalAccess,
  withWorkspaceAccess,
  OWNER_ROLES,
} from '../security/workspace-policy';
import { providerSessions } from '../security/provider-sessions';
import { notifyCollaborationAclChange } from '../services/collaboration-acl';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
export const exportRequestInput = z.object({ confirmName: z.string().min(2).max(50) }).strict();
export const transferInput = exportRequestInput
  .extend({ newOwnerMemberId: z.string().min(1).max(191) })
  .strict();
export const revokeSessionInput = z.object({}).strict();
const mutationBearer: RequestHandler = (req, _res, next) => {
  if (
    req.method !== 'GET' &&
    req.providerSessionId &&
    !/^Bearer [^\s]+$/i.test(req.headers.authorization || '')
  )
    return next(new ForbiddenError('Bearer authentication required'));
  next();
};
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
export function createAccountLifecycleRouter(authenticate: RequestHandler = authMiddleware) {
  const router = Router();
  router.use(authenticate, noStore, mutationBearer);
  router.get('/deletion-plan', async (req, res, next) => {
    try {
      const ownedWorkspaces = await withPrincipalAccess(req.user!.userId, async (tx) => {
        const owned = await tx.workspaceMember.findMany({
          where: { userId: req.user!.userId, role: 'OWNER' },
          select: { workspace: { select: { id: true, name: true } } },
          orderBy: { workspaceId: 'asc' },
        });
        return Promise.all(
          owned.map(async ({ workspace }) => {
            const activeOwners = await tx.workspaceMember.count({
              where: { workspaceId: workspace.id, role: 'OWNER', user: { isActive: true } },
            });
            return { ...workspace, activeOwners, requiresTransfer: activeOwners <= 1 };
          }),
        );
      });
      res.json({
        deletionAvailable: false,
        providerManaged: true,
        ownedWorkspaces,
        steps: [
          'Transfer sole ownership to an active member before leaving any workspace.',
          'Request an owner-reviewed workspace export if needed. No export is generated automatically.',
          'Agree retention, legal holds and cross-provider erasure with the operator.',
          'The operator must coordinate Clerk identity/sessions, database derivatives, queues and backup restore handling. No account data is deleted by this plan.',
        ],
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/sessions', async (req, res, next) => {
    try {
      res.json(
        await withPrincipalAccess(req.user!.userId, () =>
          providerSessions.list(req.user!.clerkId, req.providerSessionId),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post('/sessions/:sessionId/revoke', async (req, res, next) => {
    try {
      revokeSessionInput.parse(req.body);
      await withPrincipalAccess(req.user!.userId, () =>
        providerSessions.revoke(String(req.params.sessionId), req.user!.clerkId),
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  return router;
}
export function createWorkspaceLifecycleRouter(authenticate: RequestHandler = authMiddleware) {
  const router = Router({ mergeParams: true });
  router.use(authenticate, noStore, mutationBearer);
  router.get<{ workspaceId: string }>('/', async (req, res, next) => {
    try {
      res.json(
        await withWorkspaceAccess(
          req.user!.userId,
          String(req.params.workspaceId),
          OWNER_ROLES,
          async (tx) => {
            const workspace = await tx.workspace.findUniqueOrThrow({
              where: { id: String(req.params.workspaceId) },
            });
            const retainedCrdtBackups = await tx.documentCrdtBackup.count({
              where: { workspaceId: workspace.id },
            });
            const requests = await tx.workspaceExportRequest.findMany({
              where: { workspaceId: workspace.id },
              orderBy: { createdAt: 'desc' },
              take: 100,
            });
            return {
              workspaceName: workspace.name,
              retainedCrdtBackups,
              requests,
              deletionRequiresReview: true,
            };
          },
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string }>('/export-requests', async (req, res, next) => {
    try {
      const input = exportRequestInput.parse(req.body);
      const result = await withWorkspaceAccess(
        req.user!.userId,
        String(req.params.workspaceId),
        OWNER_ROLES,
        async (tx) => {
          const workspace = await tx.workspace.findUniqueOrThrow({
            where: { id: String(req.params.workspaceId) },
          });
          if (input.confirmName !== workspace.name)
            throw new ConflictError('Workspace name changed or confirmation does not match');
          return tx.workspaceExportRequest.upsert({
            where: {
              workspaceId_requestedBy: { workspaceId: workspace.id, requestedBy: req.user!.userId },
            },
            create: { workspaceId: workspace.id, requestedBy: req.user!.userId },
            update: {},
          });
        },
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string }>('/transfer', async (req, res, next) => {
    try {
      const input = transferInput.parse(req.body),
        workspaceId = String(req.params.workspaceId),
        actor = req.user!.userId;
      const result = await withWorkspaceAccess(actor, workspaceId, OWNER_ROLES, async (tx) => {
        const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
        if (input.confirmName !== workspace.name)
          throw new ConflictError('Workspace name changed or confirmation does not match');
        const target = await tx.workspaceMember.findFirst({
          where: { id: input.newOwnerMemberId, workspaceId },
        });
        if (!target) throw new NotFoundError('Member not found');
        if (target.userId === actor) throw new BadRequestError('Choose another active member');
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${target.userId} FOR SHARE`;
        const user = await tx.user.findUnique({
          where: { id: target.userId },
          select: { isActive: true },
        });
        if (!user?.isActive) throw new ForbiddenError('Choose an active member');
        await tx.workspaceMember.update({
          where: { id: target.id, workspaceId },
          data: { role: 'OWNER' },
        });
        await tx.workspaceMember.update({
          where: { userId_workspaceId: { userId: actor, workspaceId } },
          data: { role: 'EDITOR' },
        });
        await tx.activity.create({
          data: {
            workspaceId,
            userId: actor,
            type: 'ownership_transferred',
            message: 'transferred workspace ownership to an active member',
          },
        });
        return { newOwnerUserId: target.userId, previousOwnerRole: 'EDITOR' as const };
      });
      notifyCollaborationAclChange(workspaceId, actor);
      notifyCollaborationAclChange(workspaceId, result.newOwnerUserId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
