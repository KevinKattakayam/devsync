import { NextFunction, Request, Response, Router } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getQueue, QueueNames } from '../lib/queue';
import { ForbiddenError } from '../utils/errors';

const router = Router();

async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.header('x-superadmin-service-token') === process.env.SUPERADMIN_SERVICE_TOKEN && process.env.SUPERADMIN_SERVICE_TOKEN) return next();
    const clerkId = getAuth(req).userId;
    if (!clerkId) throw new ForbiddenError('Superadmin authentication required');
    const rows = await prisma.$queryRaw<Array<{ systemRole: string }>>`SELECT "systemRole"::text FROM "User" WHERE "clerkId" = ${clerkId}`;
    if (rows[0]?.systemRole !== 'SUPER_ADMIN') throw new ForbiddenError('SUPER_ADMIN role required');
    next();
  } catch (error) { next(error); }
}

router.use(requireSuperAdmin);

router.get('/metrics', async (_req, res, next) => {
  try {
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [activeWorkspaces, mrr, usage, prWaiting, taskWaiting] = await Promise.all([
      (prisma as any).workspace.count({ where: { suspendedAt: null } }),
      (prisma as any).workspace.count({ where: { billingStatus: 'active' } }),
      (prisma as any).tokenUsage.aggregate({ where: { createdAt: { gte: month } }, _sum: { tokens: true } }),
      getQueue(QueueNames.PR_SUMMARY).getWaitingCount(), getQueue(QueueNames.TASK_COMPLETION).getWaitingCount(),
    ]);
    res.json({ activeWorkspaces, mrrCents: mrr * Number(process.env.STRIPE_PLAN_MRR_CENTS || 0), aiTokens: usage._sum.tokens || 0, queueDepth: prWaiting + taskWaiting, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

const killSwitchSchema = z.object({ reason: z.string().min(3).max(500) });
router.post('/workspaces/:workspaceId/kill-switch', async (req, res, next) => {
  try {
    const { reason } = killSwitchSchema.parse(req.body);
    const workspace = await (prisma as any).workspace.update({ where: { id: req.params.workspaceId }, data: { suspendedAt: new Date(), billingStatus: 'suspended' } });
    const { io } = await import('../server');
    io.in(`workspace:${workspace.id}`).emit('workspace:suspended', { reason });
    io.in(`workspace:${workspace.id}`).disconnectSockets(true);
    res.json({ workspaceId: workspace.id, suspendedAt: workspace.suspendedAt, reason });
  } catch (error) { next(error); }
});

export default router;
