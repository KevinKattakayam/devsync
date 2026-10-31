import { Server as HttpServer } from 'http';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';
import { createCollaborationServer } from './collaboration-server';
import { reconcileOfflineAiActions } from './crdt-sync.service';
let runtime: ReturnType<typeof createCollaborationServer> | null = null;
export function getHocuspocus() {
  if (!runtime) throw new Error('Collaboration not initialized');
  return runtime.hocuspocus;
}
export function setupHocuspocusServer(http: HttpServer) {
  runtime = createCollaborationServer(http, {
    db: prisma, redisUrl: process.env.REDIS_URL, reconcile: reconcileOfflineAiActions,
    async identify(token) {
      const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      let user = await prisma.user.findUnique({ where: { clerkId: String(claims.sub) } });
      if (!user) {
        const { syncClerkUser } = await import('../middleware/auth.middleware');
        user = await syncClerkUser(String(claims.sub));
      }
      if (!user?.isActive) throw new Error('Authentication required');
      return { id: user.id, name: user.name || 'Member', expiresAt: Number(claims.exp) * 1000 };
    },
  });
  return runtime.hocuspocus;
}
export async function destroyHocuspocus(): Promise<void> { if (runtime) { const current = runtime; runtime = null; await current.stop(); } }
