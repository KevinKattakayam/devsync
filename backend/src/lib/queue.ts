import { Queue, Worker, Job } from 'bullmq';
import { redis } from './redis';
import { activeTraceId } from '../observability/telemetry';
import { createHash } from 'crypto';
import Redis from 'ioredis';

/** Shared BullMQ connection config — reuses the primary Redis client's connection options. */
const connection = {
  host: redis.options.host,
  port: redis.options.port,
  password: redis.options.password,
  db: redis.options.db,
  tls: redis.options.tls,
  maxRetriesPerRequest: null as null,
};

// ── Queue names ──────────────────────────────────────────────────

export const QueueNames = {
  EMBEDDING: 'devsync-embedding',
  TASK_COMPLETION: 'devsync-agent-task-completion',
  PR_SUMMARY: 'devsync-agent-pr-summary',
  INGESTION: 'devsync-ingestion',
  DEAD_LETTER: 'devsync-dead-letter',
  AUTOMATION: 'devsync-automation',
} as const;

export interface DeadLetterJob {
  sourceQueue: string;
  sourceJobId: string | undefined;
  name: string;
  data: unknown;
  attemptsMade: number;
  failedReason: string;
  failedAt: string;
}

/** Automation payloads and error strings can contain workspace data or provider secrets. */
export function automationDeadLetter(attemptsMade: number, now = new Date()): DeadLetterJob {
  return {
    sourceQueue: QueueNames.AUTOMATION,
    sourceJobId: undefined,
    name: 'automation',
    data: null,
    attemptsMade,
    failedReason: 'Automation execution failed',
    failedAt: now.toISOString(),
  };
}

export interface TracedJobData {
  traceId?: string;
}

/** Attach this to job payloads at enqueue boundaries to preserve trace linkage. */
export function withTraceContext<T extends object>(data: T): T & TracedJobData {
  return { ...data, ...(activeTraceId() ? { traceId: activeTraceId() } : {}) };
}

// ── Queue instances ──────────────────────────────────────────────

const queues = new Map<string, Queue>();
const automationConnections = new Map<Queue, Redis>();

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    const producer =
      name === QueueNames.AUTOMATION
        ? new Redis({
            ...connection,
            username: redis.options.username,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 3000,
          })
        : undefined;
    producer?.on('error', () => console.error('[Automation] Queue unavailable'));
    queue = new Queue(name, {
      connection: producer || connection,
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
    if (producer) automationConnections.set(queue, producer);
    if (name === QueueNames.AUTOMATION)
      queue.on('error', () => console.error('[Automation] Queue unavailable'));
    queues.set(name, queue);
  }
  return queue;
}

/** Replace a stalled automation producer; pending jobs remain recoverable in PostgreSQL. */
export function resetAutomationQueue(expected: Queue): void {
  if (queues.get(QueueNames.AUTOMATION) !== expected) return;
  queues.delete(QueueNames.AUTOMATION);
  automationConnections.get(expected)?.disconnect();
  automationConnections.delete(expected);
  void expected.close().catch(() => console.error('[Automation] Queue close failed'));
}

// ── Worker factory ───────────────────────────────────────────────

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 3,
): Worker<T> {
  const safeProcessor =
    queueName === QueueNames.AUTOMATION
      ? async (job: Job<T>) => {
          try {
            await processor(job);
          } catch {
            throw new Error('Automation execution failed');
          }
        }
      : processor;
  const worker = new Worker<T>(queueName, safeProcessor, {
    connection:
      queueName === QueueNames.AUTOMATION
        ? { ...connection, username: redis.options.username }
        : connection,
    concurrency,
  });

  worker.on('completed', (job) => {
    if (queueName === QueueNames.AUTOMATION) console.log('[Worker:automation] Job completed');
    else console.log(`[Worker:${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    if (queueName === QueueNames.AUTOMATION) console.error('[Worker:automation] Job failed');
    else console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, err.message);
    const attempts = typeof job?.opts.attempts === 'number' ? job.opts.attempts : 1;
    if (job && queueName !== QueueNames.DEAD_LETTER && job.attemptsMade >= attempts) {
      void getQueue(QueueNames.DEAD_LETTER)
        .add(
          'failed-job',
          queueName === QueueNames.AUTOMATION
            ? automationDeadLetter(job.attemptsMade)
            : ({
                sourceQueue: queueName,
                sourceJobId: job.id,
                name: job.name,
                data: job.data,
                attemptsMade: job.attemptsMade,
                failedReason: err.message,
                failedAt: new Date().toISOString(),
              } satisfies DeadLetterJob),
          {
            jobId:
              queueName === QueueNames.AUTOMATION
                ? `dlq-automation-${createHash('sha256').update(String(job.id)).digest('hex')}`
                : `dlq-${queueName}-${job.id}`,
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false,
          },
        )
        .catch((dlqError: Error) =>
          queueName === QueueNames.AUTOMATION
            ? console.error('[DLQ] Could not enqueue automation job')
            : console.error('[DLQ] Could not enqueue failed job:', dlqError.message),
        );
    }
  });

  worker.on('error', (err) => {
    if (queueName === QueueNames.AUTOMATION) console.error('[Worker:automation] Worker error');
    else console.error(`[Worker:${queueName}] Error:`, err.message);
  });

  return worker;
}

// ── Graceful shutdown ────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, queue] of queues) {
    automationConnections.get(queue)?.disconnect();
    automationConnections.delete(queue);
    closePromises.push(queue.close());
  }
  await Promise.allSettled(closePromises);
}
