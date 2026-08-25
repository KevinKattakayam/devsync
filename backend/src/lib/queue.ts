import { Queue, Worker, Job } from 'bullmq';
import { redis } from './redis';
import { activeTraceId } from '../observability/telemetry';

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

export interface TracedJobData { traceId?: string; }

/** Attach this to job payloads at enqueue boundaries to preserve trace linkage. */
export function withTraceContext<T extends object>(data: T): T & TracedJobData {
  return { ...data, ...(activeTraceId() ? { traceId: activeTraceId() } : {}) };
}

// ── Queue instances ──────────────────────────────────────────────

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

// ── Worker factory ───────────────────────────────────────────────

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 3,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker:${queueName}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${queueName}] Job ${job?.id} failed:`, err.message);
    const attempts = typeof job?.opts.attempts === 'number' ? job.opts.attempts : 1;
    if (job && queueName !== QueueNames.DEAD_LETTER && job.attemptsMade >= attempts) {
      void getQueue(QueueNames.DEAD_LETTER).add('failed-job', {
        sourceQueue: queueName,
        sourceJobId: job.id,
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
      } satisfies DeadLetterJob, {
        jobId: `dlq-${queueName}-${job.id}`,
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      }).catch((dlqError: Error) => console.error('[DLQ] Could not enqueue failed job:', dlqError.message));
    }
  });

  worker.on('error', (err) => {
    console.error(`[Worker:${queueName}] Error:`, err.message);
  });

  return worker;
}

// ── Graceful shutdown ────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, queue] of queues) {
    closePromises.push(queue.close());
  }
  await Promise.allSettled(closePromises);
}
