import dotenv from 'dotenv';
dotenv.config();

import { startTelemetry, stopTelemetry } from './observability/telemetry';
startTelemetry('devsync-worker');

import { prisma } from './lib/prisma';
import { disconnectRedis } from './lib/redis';
import { closeQueues, createWorker, QueueNames } from './lib/queue';
import { startTaskCompletionWorker } from './agents/task-completion.agent';
import { startPRSummaryWorker } from './agents/pr-summary.agent';
import { refreshEmbedding } from './services/embedding.service';
import { Worker } from 'bullmq';
import { z } from 'zod';
import { startEmbeddingPolling } from './services/embedding-runner';
import { drainResources } from './lib/lifecycle';
import { logger } from './observability/logger';

// ── Embedding Worker (replaces setInterval polling) ─────────

const embeddingJobSchema = z.object({
  resourceType: z.enum(['document', 'snippet', 'task']),
  resourceId: z.string().min(1).max(191),
  workspaceId: z.string().min(1).max(191),
});
type EmbeddingJobData = z.infer<typeof embeddingJobSchema>;

function startEmbeddingWorker(): Worker<EmbeddingJobData> {
  return createWorker<EmbeddingJobData>(
    QueueNames.EMBEDDING,
    async (job) => {
      const { resourceType, resourceId, workspaceId } = embeddingJobSchema.parse(job.data);
      await refreshEmbedding(resourceType, resourceId, workspaceId);
    },
    3, // 3 concurrent embedding jobs
  );
}

// ── Start all workers ────────────────────────────────────────

const workers: Worker[] = [];

function start() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     ⚡ DevSync Worker Process           ║
  ║     Environment: ${process.env.NODE_ENV || 'development'}          ║
  ╚══════════════════════════════════════════╝
  `);

  workers.push(startEmbeddingWorker());
  console.log('[Worker] Embedding worker started');

  workers.push(startTaskCompletionWorker());
  console.log('[Worker] Task completion agent started');

  workers.push(startPRSummaryWorker());
  console.log('[Worker] PR summary agent started');
}

start();
const embeddingPoller = startEmbeddingPolling();

// ── Graceful shutdown ────────────────────────────────────────

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  logger.info({ signal }, 'Worker draining');
  shutdownPromise = drainResources({
    stopAccepting: () => embeddingPoller.stop(),
    collaboration: async () => {
      const outcomes = await Promise.allSettled(workers.map((worker) => worker.close()));
      if (outcomes.some((outcome) => outcome.status === 'rejected'))
        throw new Error('Worker drain failed');
      await closeQueues();
    },
    sockets: async () => {},
    redis: disconnectRedis,
    database: () => prisma.$disconnect(),
    telemetry: stopTelemetry,
    force: () => process.exit(1),
  }).then(
    () => {
      process.exit(0);
    },
    () => {
      logger.fatal('Worker shutdown failed');
      process.exit(1);
    },
  );
  return shutdownPromise;
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', () => {
  logger.fatal('Unhandled worker failure');
  void shutdown('unhandledRejection');
});
process.on('uncaughtException', () => {
  logger.fatal('Uncaught worker exception');
  void shutdown('uncaughtException');
});
