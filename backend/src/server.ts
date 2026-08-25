import dotenv from 'dotenv';
dotenv.config();

import { startTelemetry, stopTelemetry } from './observability/telemetry';
startTelemetry('devsync-api');

import { createServer } from 'http';
import app from './app';
import { setupSocket } from './socket/index';
import { setupHocuspocusServer, destroyHocuspocus } from './services/yjs.service';
import { processEmbeddingJobs } from './services/embedding.service';
import { disconnectRedis } from './lib/redis';
import { prisma } from './lib/prisma';

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.io (with Redis adapter for horizontal scaling)
const io = setupSocket(httpServer);

// Initialize Hocuspocus CRDT collaboration server
setupHocuspocusServer(httpServer);

// Embedding worker — runs in-process when configured (production should use `npm run worker`)
if (process.env.RUN_EMBEDDING_WORKER_IN_API === 'true') {
  setInterval(() => void processEmbeddingJobs(), 10_000).unref();
  void processEmbeddingJobs();
}

httpServer.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🚀 DevSync Backend Server           ║
  ║     Running on port ${PORT}                ║
  ║     Environment: ${process.env.NODE_ENV || 'development'}          ║
  ╚══════════════════════════════════════════╝
  `);
});

// ── Graceful shutdown ────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  httpServer.close();
  await destroyHocuspocus();
  io.close();
  await disconnectRedis();
  await prisma.$disconnect();
  await stopTelemetry();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { io };
