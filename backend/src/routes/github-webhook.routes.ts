import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '../lib/prisma';
import { decryptSecret } from '../services/secret.service';
import { getQueue, QueueNames } from '../lib/queue';
import { isRedisAvailable } from '../lib/redis';
import { withIdempotencyKey } from '../lib/idempotency';
import { z } from 'zod';

const router = Router();

const githubEnvelopeSchema = z.object({
  repository: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
}).passthrough();

function matchesSignature(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function taskKeys(text: string) {
  return [...text.matchAll(/(?:fixe?[sd]?|close[sd]?|resolve[sd]?)\s+([A-Z][A-Z0-9]+-\d+)/gi)].map(match => match[1].toUpperCase());
}

router.post('/', async (req, res, next) => {
  try {
    const payload: any = githubEnvelopeSchema.parse(req.body);
    const repositoryId = String(payload?.repository?.id || '');
    const repository = await prisma.gitHubRepository.findUnique({ where: { repositoryId } });
    if (!repository) return res.status(202).json({ ignored: 'Repository is not connected' });
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw || !matchesSignature(raw, req.header('x-hub-signature-256'), decryptSecret(repository.webhookSecret))) return res.status(401).json({ error: 'Invalid webhook signature' });

    const deliveryId = req.header('x-github-delivery');
    const event = req.header('x-github-event') || 'unknown';
    if (!deliveryId) return res.status(400).json({ error: 'Missing delivery ID' });
    const idempotent = await withIdempotencyKey(`github:${repositoryId}:${deliveryId}`, async () => {
      try {
        await prisma.gitHubWebhookDelivery.create({ data: { deliveryId, event } });
        return true;
      } catch (error: unknown) {
        if ((error as { code?: string }).code === 'P2002') return false;
        throw error;
      }
    });
    if (idempotent.duplicate || !idempotent.value) return res.status(202).json({ ignored: 'Duplicate delivery' });

    // ── Handle push events ─────────────────────────────────
    if (event === 'push') {
      const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
      const commitCount = payload.commits?.length || 0;
      const pusher = payload.pusher?.name || 'unknown';

      // Create activity record for the push
      const ownerMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: repository.workspaceId, role: 'OWNER' },
        select: { userId: true },
      });

      if (ownerMember) {
        await prisma.activity.create({
          data: {
            type: 'github_push',
            message: `${pusher} pushed ${commitCount} commit(s) to ${branch} on ${payload.repository?.full_name || 'unknown'}`,
            metadata: {
              branch,
              commitCount,
              pusher,
              repository: payload.repository?.full_name,
              automated: true,
            },
            userId: ownerMember.userId,
            workspaceId: repository.workspaceId,
          },
        });
      }

      // Emit real-time activity event
      try {
        const { io } = await import('../server');
        io.to(`workspace:${repository.workspaceId}`).emit('activity:new', {
          type: 'github_push',
          message: `${pusher} pushed ${commitCount} commit(s) to ${branch}`,
        });
      } catch { /* Socket emit is non-critical */ }

      return res.status(200).json({ processed: 'push event recorded' });
    }

    // ── Handle issues events ───────────────────────────────
    if (event === 'issues' && ['opened', 'closed'].includes(payload.action)) {
      const issueTitle = payload.issue?.title || 'Unknown issue';
      const issueAction = payload.action;
      const issueAuthor = payload.issue?.user?.login || 'unknown';

      const ownerMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId: repository.workspaceId, role: 'OWNER' },
        select: { userId: true },
      });

      if (ownerMember) {
        await prisma.activity.create({
          data: {
            type: `github_issue_${issueAction}`,
            message: `${issueAuthor} ${issueAction} issue "${issueTitle}" on ${payload.repository?.full_name || 'unknown'}`,
            metadata: {
              issueNumber: payload.issue?.number,
              issueTitle,
              issueUrl: payload.issue?.html_url,
              author: issueAuthor,
              repository: payload.repository?.full_name,
              automated: true,
            },
            userId: ownerMember.userId,
            workspaceId: repository.workspaceId,
          },
        });
      }

      try {
        const { io } = await import('../server');
        io.to(`workspace:${repository.workspaceId}`).emit('activity:new', {
          type: `github_issue_${issueAction}`,
          message: `${issueAuthor} ${issueAction} issue "${issueTitle}"`,
        });
      } catch { /* Socket emit is non-critical */ }

      return res.status(200).json({ processed: `issue ${issueAction} event recorded` });
    }

    // ── Handle PR events (existing + enhanced) ─────────────
    if (event !== 'pull_request' || !['opened', 'closed'].includes(payload.action) || (payload.action === 'closed' && !payload.pull_request?.merged)) {
      return res.status(202).json({ ignored: 'Event does not transition tasks' });
    }

    const prAction = payload.action === 'opened' ? 'opened' : 'merged';
    const targetColumnId = payload.action === 'opened' ? repository.prOpenedColumnId : repository.prMergedColumnId;

    // Dispatch PR summary agent via BullMQ
    const redisUp = await isRedisAvailable();
    if (redisUp) {
      await getQueue(QueueNames.PR_SUMMARY).add(
        `pr-${prAction}`,
        {
          action: prAction,
          prTitle: payload.pull_request?.title || '',
          prBody: payload.pull_request?.body || '',
          prNumber: payload.pull_request?.number || 0,
          prUrl: payload.pull_request?.html_url || '',
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
          workspaceId: repository.workspaceId,
          taskKeys: taskKeys(`${payload.pull_request?.title || ''}\n${payload.pull_request?.body || ''}`),
          author: payload.pull_request?.user?.login || 'unknown',
        },
        { jobId: `pr-${prAction}-${deliveryId}` },
      );
    }

    if (!targetColumnId) return res.status(202).json({ ignored: 'No workflow column configured' });
    const target = await prisma.column.findUnique({ where: { id: targetColumnId }, include: { board: true } });
    if (!target || target.board.workspaceId !== repository.workspaceId) return res.status(409).json({ error: 'Configured workflow column is invalid' });

    const keys = taskKeys(`${payload.pull_request?.title || ''}\n${payload.pull_request?.body || ''}`);
    if (!keys.length) return res.status(202).json({ ignored: 'No task reference found' });
    const tasks = await prisma.task.findMany({ where: { taskKey: { in: keys } }, select: { id: true, taskKey: true, columnId: true } });
    const moved = await prisma.$transaction(tasks.map((task, index) => prisma.task.update({ where: { id: task.id }, data: { columnId: targetColumnId, position: index } })));

    // Emit real-time Kanban events for each moved task
    try {
      const { io } = await import('../server');
      for (const task of tasks) {
        io.to(`workspace:${repository.workspaceId}`).emit('kanban:task-moved', {
          taskId: task.id,
          fromColumnId: task.columnId,
          toColumnId: targetColumnId,
          position: 0,
          source: 'github-webhook',
        });
      }
      io.to(`workspace:${repository.workspaceId}`).emit('activity:new', {
        type: `pr_${prAction}`,
        message: `PR #${payload.pull_request?.number} "${payload.pull_request?.title}" ${prAction} — moved ${moved.length} task(s)`,
      });
    } catch { /* Socket emit is non-critical */ }

    res.status(200).json({ moved: moved.length, taskKeys: tasks.map(task => task.taskKey) });
  } catch (error) { next(error); }
});

export default router;
