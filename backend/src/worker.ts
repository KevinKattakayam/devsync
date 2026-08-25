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

// ── Embedding Worker (replaces setInterval polling) ─────────

interface EmbeddingJobData {
  resourceType: 'document' | 'snippet' | 'task';
  resourceId: string;
}

function startEmbeddingWorker(): Worker<EmbeddingJobData> {
  return createWorker<EmbeddingJobData>(
    QueueNames.EMBEDDING,
    async (job) => {
      const { resourceType, resourceId } = job.data;
      await refreshEmbedding(resourceType, resourceId);
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

// ── Graceful shutdown ────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}, shutting down...`);

  // Close all workers first (let in-progress jobs finish)
  await Promise.allSettled(workers.map((w) => w.close()));

  await closeQueues();
  await disconnectRedis();
  await prisma.$disconnect();
  await stopTelemetry();

  console.log('[Worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
