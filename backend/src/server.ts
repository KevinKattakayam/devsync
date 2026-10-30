import dotenv from 'dotenv';
dotenv.config();

import { startTelemetry, stopTelemetry } from './observability/telemetry';
import { startReporting, stopReporting } from './observability/reporting';
import { logger } from './observability/logger';
import { registerCollaborationMetrics } from './observability/metrics';
import { beginDrain, drainResources } from './lib/lifecycle';
startTelemetry('devsync-api');
startReporting();

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
const collaboration = setupHocuspocusServer(httpServer);
registerCollaborationMetrics(() => ({
  connections: collaboration.getConnectionsCount(),
  rooms: collaboration.getDocumentsCount(),
}));

// Embedding worker — runs in-process when configured (production should use `npm run worker`)
let embeddingTimer: ReturnType<typeof setInterval> | undefined;
const runEmbedding = () => {
  void processEmbeddingJobs().catch(() => logger.error('Embedding polling failed'));
};
if (process.env.RUN_EMBEDDING_WORKER_IN_API === 'true') {
  embeddingTimer = setInterval(runEmbedding, 10_000);
  embeddingTimer.unref();
  runEmbedding();
}
httpServer.listen(PORT, () => logger.info({ port: PORT }, 'API listening'));

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  logger.info({ signal }, 'API draining');
  beginDrain();
  if (embeddingTimer) clearInterval(embeddingTimer);
  shutdownPromise = drainResources({
    stopAccepting: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
        httpServer.closeIdleConnections();
      }),
    collaboration: destroyHocuspocus,
    sockets: () => new Promise<void>((resolve) => io.close(() => resolve())),
    redis: disconnectRedis,
    database: () => prisma.$disconnect(),
    telemetry: async () => {
      await stopTelemetry();
      await stopReporting();
    },
    force: () => {
      logger.fatal('Shutdown deadline exceeded');
      httpServer.closeAllConnections();
      process.exit(1);
    },
  }).then(
    () => {
      logger.info('Shutdown complete');
      process.exit(0);
    },
    () => {
      logger.fatal('Shutdown failed');
      process.exit(1);
    },
  );
  return shutdownPromise;
}
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
// A process with an unknown asynchronous failure drains and exits; it does not
// silently continue in an uncertain state or log exception payloads.
process.on('unhandledRejection', () => {
  logger.fatal('Unhandled asynchronous failure');
  void shutdown('unhandledRejection');
});
process.on('uncaughtException', () => {
  logger.fatal('Uncaught exception');
  void shutdown('uncaughtException');
});

export { io };
