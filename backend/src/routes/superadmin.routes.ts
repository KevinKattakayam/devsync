import { Router } from 'express';
import { z } from 'zod';
import { getQueue, QueueNames } from '../lib/queue';
import { withSuperadminAccess } from '../security/service-policy';
import { emitWorkspace } from '../socket';
import { validate } from '../middleware/validate.middleware';
const router = Router();
router.get('/metrics', async (req, res, next) => {
  try {
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [activeWorkspaces, mrr, usage] = await withSuperadminAccess(req, (tx) =>
      Promise.all([
        tx.workspace.count({ where: { suspendedAt: null } }),
        tx.workspace.count({ where: { billingStatus: 'active' } }),
        tx.tokenUsage.aggregate({ where: { createdAt: { gte: month } }, _sum: { tokens: true } }),
      ]),
    );
    const [prWaiting, taskWaiting] = await Promise.all([
      getQueue(QueueNames.PR_SUMMARY).getWaitingCount(),
      getQueue(QueueNames.TASK_COMPLETION).getWaitingCount(),
    ]);
    res.json({
      activeWorkspaces,
      mrrCents: mrr * Number(process.env.STRIPE_PLAN_MRR_CENTS || 0),
      aiTokens: usage._sum.tokens || 0,
      queueDepth: prWaiting + taskWaiting,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
export const killSwitchSchema = z.object({ reason: z.string().min(3).max(500) });
router.post(
  '/workspaces/:workspaceId/kill-switch',
  validate(killSwitchSchema),
  async (req, res, next) => {
    try {
      const { reason } = killSwitchSchema.parse(req.body),
        workspaceId = z.string().min(1).max(191).parse(req.params.workspaceId);
      const workspace = await withSuperadminAccess(req, (tx) =>
        tx.workspace.update({
          where: { id: workspaceId },
          data: { suspendedAt: new Date(), billingStatus: 'suspended' },
        }),
      );
      emitWorkspace(workspace.id, 'workspace:suspended', { reason });
      // Every instance's transport policy sweep observes the committed suspension.
      res.json({ workspaceId: workspace.id, suspendedAt: workspace.suspendedAt, reason });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
