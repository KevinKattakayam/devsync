import { Server as HttpServer } from 'http';
import { prisma } from '../lib/prisma';
import { createCollaborationServer } from './collaboration-server';
import { reconcileOfflineAiActions } from './crdt-sync.service';
import { identifyRealtimeSession } from '../security/realtime-identity';
let runtime: ReturnType<typeof createCollaborationServer> | null = null;
export function getHocuspocus() {
  if (!runtime) throw new Error('Collaboration not initialized');
  return runtime.hocuspocus;
}
export function setupHocuspocusServer(http: HttpServer) {
  runtime = createCollaborationServer(http, {
    db: prisma,
    redisUrl: process.env.REDIS_URL,
    reconcile: reconcileOfflineAiActions,
    identify: identifyRealtimeSession,
  });
  return runtime.hocuspocus;
}
export async function destroyHocuspocus(): Promise<void> {
  if (runtime) {
    const current = runtime;
    runtime = null;
    await current.stop();
  }
}
