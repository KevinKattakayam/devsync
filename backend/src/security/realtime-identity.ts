import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';

export interface RealtimeIdentity {
  id: string;
  name: string;
  avatar?: string;
  expiresAt: number;
}
/** Production verifier shared by Socket.io and Hocuspocus; never selected by client input. */
export async function identifyRealtimeSession(token: string): Promise<RealtimeIdentity> {
  if (typeof token !== 'string' || !token || token.length > 8192)
    throw new Error('Authentication required');
  const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  const clerkId = String(claims.sub || '');
  if (!clerkId) throw new Error('Authentication required');
  let user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    const { syncClerkUser } = await import('../middleware/auth.middleware');
    user = await syncClerkUser(clerkId);
  }
  const expiresAt = Number(claims.exp) * 1000;
  if (!user?.isActive || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
    throw new Error('Authentication required');
  return { id: user.id, name: user.name || 'Member', avatar: user.avatar ?? undefined, expiresAt };
}
