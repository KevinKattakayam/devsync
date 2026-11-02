import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
import { Role } from '@prisma/client';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { RealtimeIdentity } from '../security/realtime-identity';
import { authorizeWorkspace } from '../security/workspace-policy';
import { collaborationAcl } from '../services/collaboration-acl';
import { logger } from '../observability/logger';
import { setupPresenceHandlers, AuthenticatedSocket } from './presence.handler';
import { setupKanbanHandlers } from './kanban.handler';
import { PresenceStore } from './presence-store';
import { z } from 'zod';
import { withPolicyDeadline as deadline } from '../security/policy-deadline';
import { SocketRateLimiter } from './rate-limiter';

export interface SocketServerOptions {
  db: TenantPrismaClient;
  identify(token: string): Promise<RealtimeIdentity>;
  redisUrl?: string;
  acl?: EventEmitter;
  sweepMs?: number;
  auditTimeoutMs?: number;
}
interface Session {
  identity: RealtimeIdentity;
  roles: Map<string, Role>;
  refreshRequested?: number;
}
const events = new Set([
  'workspace:join',
  'workspace:leave',
  'cursor:update',
  'kanban:task-created',
  'kanban:task-updated',
  'kanban:task-deleted',
  'kanban:task-moved',
  'session:refresh',
  'error',
]);
const refreshSchema = z.object({ token: z.string().min(1).max(8192) }).strict();
/** Transport factory; production always supplies the Clerk verifier, tests supply fixture identities. */
export function createSocketServer(http: HttpServer, options: SocketServerOptions) {
  const io = new Server(http, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    destroyUpgrade: false,
    maxHttpBufferSize: 65536,
    pingTimeout: 20000,
    pingInterval: 10000,
    allowRequest: (request, next) =>
      next(
        null,
        !request.headers.origin ||
          request.headers.origin === (process.env.FRONTEND_URL || 'http://localhost:3000'),
      ),
  });
  const sessions = new Map<AuthenticatedSocket, Session>();
  const acl = options.acl ?? collaborationAcl;
  const limiter = new SocketRateLimiter();
  let stopping = false;
  const clients = options.redisUrl
    ? [0, 1].map(() => {
        const client = new Redis(options.redisUrl!, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 1500,
          commandTimeout: 1500,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        client.on('error', () => {
          logger.warn('Socket adapter Redis unavailable');
        });
        return client;
      })
    : [];
  const ready = Promise.all(clients.map((client) => client.connect())).then(() => {
    if (clients.length && !stopping) io.adapter(createAdapter(clients[0], clients[1]));
  });
  // Authentication awaits ready and fails closed; keep a rejected startup promise observed.
  void ready.catch(() => {
    logger.error('Socket adapter initialization failed');
  });
  const presence = new PresenceStore(
    clients[0] ?? null,
    async () => clients[0]?.status === 'ready',
  );
  const reject = (socket: AuthenticatedSocket) => {
    socket.emit('error', { code: 'FORBIDDEN', message: 'Access changed' });
    socket.disconnect(true);
  };
  async function active(session: Session) {
    if (!Number.isFinite(session.identity.expiresAt) || session.identity.expiresAt <= Date.now())
      throw new Error('Session expired');
    const user = await options.db.user.findUnique({
      where: { id: session.identity.id },
      select: { isActive: true },
    });
    if (!user?.isActive) throw new Error('Access denied');
  }
  async function authorize(session: Session, workspaceId: string) {
    const member = await authorizeWorkspace(
      session.identity.id,
      workspaceId,
      undefined,
      options.db,
    );
    const previous = session.roles.get(workspaceId);
    if (previous && previous !== member.role) throw new Error('Role changed');
    return member.role;
  }
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      if (stopping) throw new Error('Server draining');
      await ready;
      const token: unknown = socket.handshake.auth.token;
      if (typeof token !== 'string' || !token || token.length > 8192)
        throw new Error('Invalid session');
      const identity = await options.identify(token);
      const session = { identity, roles: new Map<string, Role>() };
      await deadline(active(session), options.auditTimeoutMs ?? 2000);
      socket.userId = identity.id;
      socket.userName = identity.name;
      socket.userAvatar = identity.avatar;
      sessions.set(socket, session);
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket: AuthenticatedSocket) => {
    const session = sessions.get(socket);
    if (!session) {
      socket.disconnect(true);
      return;
    }
    void socket.join(`user:${session.identity.id}`);
    socket.use(async (packet, next) => {
      const event: unknown = packet[0];
      const payload: unknown = packet[1];
      if (typeof event !== 'string' || !events.has(event)) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Event rejected' });
        return;
      }
      if (!limiter.consume(socket, event)) {
        socket.emit('error', { code: 'RATE_LIMITED', message: 'Event rate exceeded' });
        return;
      }
      try {
        await deadline(
          (async () => {
            await active(session);
            if (payload && typeof payload === 'object' && 'workspaceId' in payload) {
              const workspaceId = payload.workspaceId;
              if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 191)
                throw new Error('Invalid workspace');
              if (!session.roles.has(workspaceId) && session.roles.size >= 32)
                throw new Error('Subscription limit');
              const role = await authorize(session, workspaceId);
              session.roles.set(workspaceId, role);
            }
          })(),
          options.auditTimeoutMs ?? 2000,
        );
        if (socket.connected && !stopping) next();
      } catch {
        reject(socket);
      }
    });
    setupPresenceHandlers(io, socket, {
      db: options.db,
      store: presence,
      forgetWorkspace: (workspaceId) => session.roles.delete(workspaceId),
    });
    setupKanbanHandlers(io, socket, options.db);
    socket.on('session:refresh', async (payload: unknown) => {
      try {
        const { token } = refreshSchema.parse(payload);
        const identity = await options.identify(token);
        if (identity.id !== session.identity.id) throw new Error('Principal changed');
        const renewed = { identity, roles: session.roles };
        await deadline(
          (async () => {
            await active(renewed);
            for (const workspaceId of renewed.roles.keys()) await authorize(renewed, workspaceId);
          })(),
          options.auditTimeoutMs ?? 2000,
        );
        if (!socket.connected) return;
        session.identity = identity;
        session.refreshRequested = undefined;
        socket.emit('session:updated', { expiresAt: identity.expiresAt });
      } catch {
        reject(socket);
      }
    });
    socket.on('error', () => {
      logger.warn('Socket client error');
    });
    socket.on('disconnect', () => {
      sessions.delete(socket);
      limiter.cleanup(socket.id);
    });
  });
  let auditing = false;
  const sweep = setInterval(() => {
    if (auditing || stopping) return;
    auditing = true;
    const checks = new Map<string, Promise<Role>>();
    void Promise.all(
      [...sessions].map(async ([socket, session]) => {
        try {
          await deadline(
            (async () => {
              await active(session);
              for (const [workspaceId, role] of session.roles) {
                const key = `${session.identity.id}:${workspaceId}`;
                let check = checks.get(key);
                if (!check) {
                  check = authorize(session, workspaceId);
                  checks.set(key, check);
                }
                if ((await check) !== role) throw new Error('Role changed');
              }
              if (
                session.identity.expiresAt - Date.now() < 10000 &&
                session.refreshRequested !== session.identity.expiresAt
              ) {
                session.refreshRequested = session.identity.expiresAt;
                socket.emit('session:refresh-required');
              }
            })(),
            options.auditTimeoutMs ?? 2000,
          );
        } catch {
          reject(socket);
        }
      }),
    ).finally(() => {
      auditing = false;
    });
  }, options.sweepMs ?? 1000);
  sweep.unref();
  const revoke = (workspaceId: string, userId: string) => {
    for (const [socket, session] of sessions)
      if (session.identity.id === userId && session.roles.has(workspaceId)) reject(socket);
  };
  acl.on('revoke', revoke);
  let stopPromise: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearInterval(sweep);
    acl.off('revoke', revoke);
    stopPromise = (async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await presence.drain();
      clients.forEach((client) => client.disconnect());
      sessions.clear();
    })();
    return stopPromise;
  }
  return { io, ready, stop, sessions, presence };
}
