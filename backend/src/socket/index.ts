import { Server as HttpServer } from 'http';
import { prisma } from '../lib/prisma';
import { identifyRealtimeSession } from '../security/realtime-identity';
import { createSocketServer } from './server';
let runtime: ReturnType<typeof createSocketServer> | undefined;
/** Never import the HTTP entrypoint from controllers/workers to emit events. */
export function emitWorkspace(workspaceId: string, event: string, payload: unknown): void {
  runtime?.io.to(`workspace:${workspaceId}`).emit(event, payload);
}
export function setupSocket(httpServer: HttpServer) {
  runtime = createSocketServer(httpServer, {
    db: prisma,
    identify: identifyRealtimeSession,
    redisUrl: process.env.REDIS_URL,
  });
  return runtime.io;
}
export async function destroySocket() {
  const current = runtime;
  runtime = undefined;
  await current?.stop();
}
