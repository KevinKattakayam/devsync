import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { withWorkspaceAccess, READ_ROLES } from '../security/workspace-policy';
import { NotFoundError, ConflictError } from '../utils/errors';
import {
  digestPreference,
  digestEvent,
  digestPage,
  acknowledgeDigest,
  digestPreferenceWrite,
  digestAckSchema,
  digestQuerySchema,
} from '../services/async-digest';
const router = Router({ mergeParams: true });
router.use((_req, _res, next) =>
  process.env.FEATURE_ASYNC_DIGEST === 'true'
    ? next()
    : next(new NotFoundError('Endpoint not found')),
);
router.use(authMiddleware);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get<{ workspaceId: string }>('/preferences', async (req, res, next) => {
  try {
    res.json(
      await withWorkspaceAccess(req.user!.userId, req.params.workspaceId, READ_ROLES, (tx) =>
        digestPreference(tx, req.params.workspaceId, req.user!.userId),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.put('/preferences', validate(digestPreferenceWrite), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      userId = req.user!.userId,
      input = digestPreferenceWrite.parse(req.body);
    res.json(
      await withWorkspaceAccess(userId, workspaceId, READ_ROLES, async (tx) => {
        const pref = await digestPreference(tx, workspaceId, userId, true);
        if (pref.revision !== input.expectedRevision)
          throw new ConflictError('Digest preferences changed. Reload before updating.');
        const record = await tx.asyncDigestPreference.update({
          where: { workspaceId_userId: { workspaceId, userId } },
          data: { enabled: input.enabled, revision: { increment: 1 } },
        });
        return { ...pref, enabled: record.enabled, revision: record.revision };
      }),
    );
  } catch (error) {
    next(error);
  }
});
router.get<{ workspaceId: string }>('/items', async (req, res, next) => {
  try {
    const { cursor } = digestQuerySchema.parse(req.query);
    res.json(
      await withWorkspaceAccess(req.user!.userId, req.params.workspaceId, READ_ROLES, (tx) =>
        digestPage(tx, req.params.workspaceId, req.user!.userId, cursor),
      ),
    );
  } catch (error) {
    next(error);
  }
});
// The initial inbox exposes the same source-checked, unacknowledged activity
// window as the digest. The existing acknowledgement endpoint persists its watermark.
const inboxReadInput = z.object({ read: z.boolean() }).strict();
router.get<{ workspaceId: string }>('/inbox', async (req, res, next) => {
  try {
    const { cursor } = digestQuerySchema.parse(req.query);
    res.json(
      await withWorkspaceAccess(
        req.user!.userId,
        req.params.workspaceId,
        READ_ROLES,
        async (tx) => {
          const page = await digestPage(tx, req.params.workspaceId, req.user!.userId, cursor, true);
          const states = page.items.length
            ? await tx.$queryRaw<{ activityId: string }[]>(
                Prisma.sql`SELECT "activityId" FROM "InboxReadState" WHERE "workspaceId"=${req.params.workspaceId} AND "userId"=${req.user!.userId} AND "activityId" IN (${Prisma.join(page.items.map((item) => item.activityId))})`,
              )
            : [];
          const read = new Set(states.map((state) => state.activityId));
          return {
            ...page,
            items: page.items.map((item) => ({
              ...item,
              category: item.eventType === 'task_assigned' ? 'assigned_task' : 'activity',
              read: read.has(item.activityId),
            })),
          };
        },
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.put<{ workspaceId: string; activityId: string }>(
  '/inbox/:activityId/read',
  validate(inboxReadInput),
  async (req, res, next) => {
    try {
      const { read } = inboxReadInput.parse(req.body);
      const { workspaceId, activityId } = req.params;
      const userId = req.user!.userId;
      await withWorkspaceAccess(userId, workspaceId, READ_ROLES, async (tx) => {
        await digestPreference(tx, workspaceId, userId);
        await digestEvent(tx, workspaceId, activityId, userId);
        if (read)
          await tx.$executeRaw`INSERT INTO "InboxReadState" ("workspaceId","userId","activityId") VALUES (${workspaceId},${userId},${activityId}) ON CONFLICT DO NOTHING`;
        else
          await tx.$executeRaw`DELETE FROM "InboxReadState" WHERE "workspaceId"=${workspaceId} AND "userId"=${userId} AND "activityId"=${activityId}`;
      });
      res.json({ read });
    } catch (error) {
      next(error);
    }
  },
);
router.post('/acknowledge', validate(digestAckSchema), async (req, res, next) => {
  try {
    const input = digestAckSchema.parse(req.body),
      workspaceId = String(req.params.workspaceId);
    res.json(
      await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
        acknowledgeDigest(
          tx,
          workspaceId,
          req.user!.userId,
          input.activityId,
          input.expectedRevision,
        ),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.get<{ workspaceId: string; activityId: string }>(
  '/events/:activityId',
  async (req, res, next) => {
    try {
      const workspaceId = String(req.params.workspaceId),
        activityId = String(req.params.activityId);
      if (activityId.length > 191) throw new NotFoundError();
      res.json(
        await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
          digestEvent(tx, workspaceId, activityId),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
export default router;
