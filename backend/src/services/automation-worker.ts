import { createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createWorker, getQueue, QueueNames, resetAutomationQueue } from '../lib/queue';
import { encryptSecret, decryptSecret } from './secret.service';
import {
  claimAutomationExecution,
  executeAutomationExecution,
  failAutomationClaim,
} from './automation-execution';

const jobSchema = z
  .object({
    executionId: z.uuid(),
    tenantEnvelope: z
      .string()
      .min(20)
      .max(1024)
      .regex(/^enc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/),
  })
  .strict();
export type AutomationJob = z.infer<typeof jobSchema>;
const pending = new Set<string>();
export async function automationQueueDeadline<T>(
  operation: Promise<T>,
  timeoutMs = 3000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Automation queue unavailable')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function automationJob(workspaceId: string, executionId: string): AutomationJob {
  z.string().min(1).max(191).parse(workspaceId);
  return jobSchema.parse({ executionId, tenantEnvelope: encryptSecret(workspaceId) });
}
export function automationJobId(executionId: string) {
  return `automation-${createHash('sha256').update(z.uuid().parse(executionId)).digest('hex')}`;
}
/** Queue data never supplies authority; current approval and membership are rechecked in the transaction. */
export async function processAutomationJob(raw: unknown) {
  if (process.env.FEATURE_AUTOMATION !== 'true') return;
  const input = jobSchema.parse(raw);
  const workspaceId = z.string().min(1).max(191).parse(decryptSecret(input.tenantEnvelope));
  const claim = await claimAutomationExecution(workspaceId, input.executionId);
  if (!claim) return;
  try {
    await executeAutomationExecution(workspaceId, input.executionId, claim.token);
  } catch (error) {
    await failAutomationClaim(workspaceId, input.executionId, claim.token).catch(() => undefined);
    throw error;
  }
}
/** Scheduler sees opaque IDs only; all execution data remains behind tenant RLS. */
export async function dispatchAutomationWorkspace(workspaceId: string) {
  if (process.env.FEATURE_AUTOMATION !== 'true') return;
  const ids = await prisma.withTenantTransaction(
    workspaceId,
    async (tx) =>
      tx.$queryRaw<
        { id: string }[]
      >`SELECT x.id FROM "AutomationExecution" x LEFT JOIN "AutomationLease" l ON l."executionId"=x.id AND l."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND x.status='approved' AND (l.token IS NULL OR l."leaseUntil"<=NOW()) ORDER BY x."createdAt",x.id LIMIT 10`,
  );
  for (const { id } of ids) {
    if (pending.has(id)) continue;
    if (pending.size >= 64) return;
    const queue = getQueue(QueueNames.AUTOMATION);
    const operation = queue.add('execute', automationJob(workspaceId, id), {
      jobId: automationJobId(id),
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    pending.add(id);
    void operation.then(
      () => pending.delete(id),
      () => pending.delete(id),
    );
    try {
      await automationQueueDeadline(operation);
    } catch {
      resetAutomationQueue(queue);
      throw new Error('Automation queue unavailable');
    }
  }
}
export function startAutomationWorker() {
  return createWorker<AutomationJob>(
    QueueNames.AUTOMATION,
    async (job) => processAutomationJob(job.data),
    3,
  );
}
/** Bounded metadata scan, including suspended workspaces so stale approvals can be cancelled. */
export function startAutomationPolling(intervalMs = 5000) {
  let stopped = false,
    cursor: string | undefined;
  let inFlight: Promise<void> | undefined;
  function tick() {
    if (stopped || inFlight || process.env.FEATURE_AUTOMATION !== 'true') return;
    inFlight = (async () => {
      const workspaces = await prisma.workspace.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const workspace of workspaces) {
        if (stopped) break;
        try {
          await dispatchAutomationWorkspace(workspace.id);
        } catch {
          console.error('[Automation] Dispatch unavailable');
        }
      }
      cursor = workspaces.length === 100 ? workspaces[workspaces.length - 1].id : undefined;
    })()
      .catch(() => {
        cursor = undefined;
        console.error('[Automation] Scheduler unavailable');
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
