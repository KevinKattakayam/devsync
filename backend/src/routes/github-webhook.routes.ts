import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getQueue, QueueNames } from '../lib/queue';
import { isRedisAvailable } from '../lib/redis';
import { withGitHubWebhookAccess } from '../security/service-policy';
import { emitWorkspace } from '../socket';
import type { PRSummaryJobData } from '../agents/pr-summary.agent';
import { validate } from '../middleware/validate.middleware';
import { ConflictError } from '../utils/errors';
const router = Router();
const actorSchema = z.object({ login: z.string().max(255).optional() }).passthrough();
export const githubEnvelopeSchema = z
  .object({
    repository: z
      .object({
        id: z.union([z.string().min(1).max(191), z.number().int().nonnegative()]),
        full_name: z.string().max(512).optional(),
      })
      .passthrough(),
    action: z.string().max(100).optional(),
    ref: z.string().max(512).optional(),
    pusher: z
      .object({ name: z.string().max(255).optional() })
      .passthrough()
      .optional(),
    commits: z.array(z.unknown()).max(1000).optional(),
    issue: z
      .object({
        title: z.string().max(2000).optional(),
        number: z.number().int().optional(),
        html_url: z.string().max(2048).optional(),
        user: actorSchema.optional(),
      })
      .passthrough()
      .optional(),
    pull_request: z
      .object({
        title: z.string().max(2000).optional(),
        body: z.string().max(32000).nullable().optional(),
        number: z.number().int().optional(),
        html_url: z.string().max(2048).optional(),
        merged: z.boolean().optional(),
        user: actorSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
function taskKeys(text: string) {
  return [
    ...new Set(
      [...text.matchAll(/(?:fixe?[sd]?|close[sd]?|resolve[sd]?)\s+([A-Z][A-Z0-9]+-\d+)/gi)].map(
        (match) => match[1].toUpperCase(),
      ),
    ),
  ].slice(0, 50);
}
interface Outcome {
  status: number;
  body: Record<string, unknown>;
  workspaceId?: string;
  job?: PRSummaryJobData;
  events?: { name: string; payload: unknown }[];
}
router.post('/', validate(githubEnvelopeSchema), async (req, res, next) => {
  try {
    const payload = githubEnvelopeSchema.parse(req.body),
      raw = req.rawBody;
    if (!raw) return res.status(401).json({ error: 'Invalid webhook signature' });
    const deliveryId = z.string().min(1).max(191).parse(req.header('x-github-delivery'));
    const event = z
      .string()
      .max(100)
      .parse(req.header('x-github-event') || 'unknown');
    const result = await withGitHubWebhookAccess<Outcome>(
      String(payload.repository.id),
      raw,
      req.header('x-hub-signature-256'),
      async (tx, repository) => {
        const inserted = await tx.$queryRaw<
          { id: string }[]
        >`INSERT INTO "GitHubWebhookDelivery" (id, "deliveryId", event, "receivedAt") VALUES (${randomUUID()}, ${deliveryId}, ${event}, NOW()) ON CONFLICT ("deliveryId") DO NOTHING RETURNING id`;
        if (!inserted.length) return { status: 202, body: { ignored: 'Duplicate delivery' } };
        const workspaceId = repository.workspaceId;
        if (
          event === 'push' ||
          (event === 'issues' && ['opened', 'closed'].includes(payload.action || ''))
        ) {
          const owner = await tx.workspaceMember.findFirst({
            where: { workspaceId, role: 'OWNER', user: { isActive: true } },
            select: { userId: true },
          });
          const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
          const type = event === 'push' ? 'github_push' : `github_issue_${payload.action}`;
          const message =
            event === 'push'
              ? `${payload.pusher?.name || 'unknown'} pushed ${payload.commits?.length || 0} commit(s) to ${branch}`
              : `${payload.issue?.user?.login || 'unknown'} ${payload.action} issue "${payload.issue?.title || 'Unknown issue'}"`;
          if (owner)
            await tx.activity.create({
              data: {
                type,
                message,
                userId: owner.userId,
                workspaceId,
                metadata: {
                  repository:
                    payload.repository.full_name || `${repository.owner}/${repository.name}`,
                  automated: true,
                  authority: 'repository-webhook',
                },
              },
            });
          return {
            status: 200,
            body: {
              processed:
                event === 'push' ? 'push event recorded' : `issue ${payload.action} event recorded`,
            },
            workspaceId,
            events: [{ name: 'activity:new', payload: { type, message } }],
          };
        }
        if (
          event !== 'pull_request' ||
          !['opened', 'closed'].includes(payload.action || '') ||
          (payload.action === 'closed' && !payload.pull_request?.merged)
        )
          return { status: 202, body: { ignored: 'Event does not transition tasks' } };
        const pr = payload.pull_request,
          action = payload.action === 'opened' ? 'opened' : 'merged';
        const keys = taskKeys(`${pr?.title || ''}\n${pr?.body || ''}`);
        const job: PRSummaryJobData = {
          action,
          prTitle: pr?.title || '',
          prBody: pr?.body || '',
          prNumber: pr?.number || 0,
          prUrl: pr?.html_url || '',
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
          repositoryId: repository.id,
          workspaceId,
          taskKeys: keys,
          author: pr?.user?.login || 'unknown',
        };
        const targetColumnId =
          action === 'opened' ? repository.prOpenedColumnId : repository.prMergedColumnId;
        if (!targetColumnId)
          return {
            status: 202,
            body: { ignored: 'No workflow column configured' },
            workspaceId,
            job,
          };
        const target = await tx.column.findUnique({
          where: { id: targetColumnId },
          include: { board: true },
        });
        if (!target || target.board.workspaceId !== workspaceId)
          throw new ConflictError('Configured workflow column is invalid');
        if (!keys.length)
          return { status: 202, body: { ignored: 'No task reference found' }, workspaceId, job };
        const tenant = { column: { board: { workspaceId } } };
        const tasks = await tx.task.findMany({
          where: { ...tenant, columnId: { not: targetColumnId }, taskKey: { in: keys } },
          select: { id: true, taskKey: true, columnId: true, position: true },
        });
        const max = await tx.task.findFirst({
          where: { columnId: targetColumnId },
          orderBy: { position: 'desc' },
        });
        const events: NonNullable<Outcome['events']> = [];
        for (const [index, task] of tasks.entries()) {
          const position = (max?.position ?? -1) + index + 1;
          await tx.task.update({
            where: { id: task.id, ...tenant },
            data: { columnId: targetColumnId, position },
          });
          await tx.task.updateMany({
            where: { columnId: task.columnId, position: { gt: task.position } },
            data: { position: { decrement: 1 } },
          });
          events.push({
            name: 'kanban:task-moved',
            payload: {
              taskId: task.id,
              fromColumnId: task.columnId,
              toColumnId: targetColumnId,
              position,
              source: 'github-webhook',
            },
          });
        }
        return {
          status: 200,
          body: { moved: tasks.length, taskKeys: tasks.map((task) => task.taskKey) },
          workspaceId,
          job,
          events,
        };
      },
    );
    if (!result) return res.status(202).json({ ignored: 'Repository is not connected' });
    if (result.job && (await isRedisAvailable()))
      await getQueue(QueueNames.PR_SUMMARY).add(`pr-${result.job.action}`, result.job, {
        jobId: `pr-${result.job.action}-${deliveryId}`,
      });
    if (result.workspaceId)
      for (const event of result.events || [])
        emitWorkspace(result.workspaceId, event.name, event.payload);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});
export default router;
