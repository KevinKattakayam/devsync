import { clerkClient } from '@clerk/express';
import { AppError, UnauthorizedError, ForbiddenError } from '../utils/errors';
import { withPolicyDeadline } from './policy-deadline';
export interface ProviderSession {
  id: string;
  userId: string;
  status: string;
  expireAt: number;
  createdAt: number;
  lastActiveAt: number;
}
export interface SessionProvider {
  get(id: string): Promise<ProviderSession>;
  list(userId: string): Promise<{ data: ProviderSession[]; totalCount: number }>;
  revoke(id: string): Promise<ProviderSession>;
}
/** Provider-owned sessions only. Bounded coalescing cache never extends JWT expiry. */
export class ProviderSessions {
  private readonly cache = new Map<string, { until: number; value: Promise<ProviderSession> }>();
  constructor(
    private readonly provider: SessionProvider,
    private readonly now = Date.now,
    private readonly monotonic = () => performance.now(),
  ) {}
  private async remote<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await withPolicyDeadline(operation(), 1500);
    } catch {
      throw new AppError('Identity session service unavailable', 503);
    }
  }
  async assertActive(sessionId: string | null | undefined, userId: string): Promise<void> {
    if (!sessionId || !/^sess_[a-zA-Z0-9_-]{1,180}$/.test(sessionId) || !userId)
      throw new UnauthorizedError('Invalid session');
    let entry = this.cache.get(sessionId);
    if (!entry || entry.until <= this.monotonic()) {
      if (this.cache.size >= 2000) this.cache.delete(this.cache.keys().next().value || '');
      entry = {
        until: this.monotonic() + 5000,
        value: this.remote(() => this.provider.get(sessionId)),
      };
      this.cache.set(sessionId, entry);
    }
    let session: ProviderSession;
    try {
      session = await entry.value;
    } catch (error) {
      if (this.cache.get(sessionId) === entry) this.cache.delete(sessionId);
      throw error;
    }
    // A revoke that races an in-flight status request must not resurrect cached authority.
    if (this.cache.get(sessionId) !== entry) return this.assertActive(sessionId, userId);
    if (
      session.id !== sessionId ||
      session.userId !== userId ||
      session.status !== 'active' ||
      !Number.isFinite(session.expireAt) ||
      session.expireAt <= this.now()
    )
      throw new UnauthorizedError('Invalid or revoked session');
  }
  async list(userId: string, current?: string) {
    const result = await this.remote(() => this.provider.list(userId));
    if (result.data.some((s) => s.userId !== userId)) throw new ForbiddenError('Access denied');
    return {
      items: result.data.slice(0, 100).map((s) => ({
        id: s.id,
        current: s.id === current,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
      })),
      hasMore: result.totalCount > 100,
    };
  }
  async revoke(sessionId: string, userId: string) {
    if (!/^sess_[a-zA-Z0-9_-]{1,180}$/.test(sessionId)) throw new ForbiddenError('Access denied');
    const session = await this.remote(() => this.provider.get(sessionId));
    if (session.userId !== userId || session.id !== sessionId)
      throw new ForbiddenError('Access denied');
    this.cache.delete(sessionId);
    const revoked = await this.remote(() => this.provider.revoke(sessionId));
    if (revoked.userId !== userId || revoked.id !== sessionId || revoked.status !== 'revoked')
      throw new AppError('Session revocation was not confirmed', 503);
    this.cache.set(sessionId, { until: this.monotonic() + 5000, value: Promise.resolve(revoked) });
  }
}
function configured() {
  if (!process.env.CLERK_SECRET_KEY)
    throw new AppError('Identity session service unavailable', 503);
}
export const providerSessions = new ProviderSessions({
  get: (id) => {
    configured();
    return clerkClient.sessions.getSession(id);
  },
  list: (userId) => {
    configured();
    return clerkClient.sessions.getSessionList({ userId, status: 'active', limit: 100 });
  },
  revoke: (id) => {
    configured();
    return clerkClient.sessions.revokeSession(id);
  },
});
