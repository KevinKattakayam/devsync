import { Server as HttpServer } from 'http';
import { prisma } from '../lib/prisma';
import { identifyRealtimeSession } from '../security/realtime-identity';
import { createSocketServer } from './server';
let runtime: ReturnType<typeof createSocketServer> | undefined;
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
