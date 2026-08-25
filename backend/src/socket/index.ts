import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';
import { redis, redisSubscriber, isRedisAvailable } from '../lib/redis';
import { setupPresenceHandlers } from './presence.handler';
import { setupKanbanHandlers } from './kanban.handler';
import { socketRateLimiter } from './rate-limiter';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

export function setupSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Redis adapter for horizontal scaling ─────────────────────
  // Gracefully degrade to single-instance if Redis is unavailable
  isRedisAvailable().then((available) => {
    if (available) {
      io.adapter(createAdapter(redis, redisSubscriber));
      console.log('[Socket.io] Redis adapter attached — horizontal scaling enabled');
    } else {
      console.warn('[Socket.io] Redis not available — running in single-instance mode');
    }
  }).catch(() => {
    console.warn('[Socket.io] Redis adapter setup failed — running in single-instance mode');
  });

  // ── Auth middleware ──────────────────────────────────────────
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const clerkId = String(claims.sub || '');
      let user = await prisma.user.findUnique({ where: { clerkId } });
      if (!user) {
        const { syncClerkUser } = await import('../middleware/auth.middleware');
        user = await syncClerkUser(clerkId);
      }
      socket.userId = user.id;
      socket.userName = user.name || user.email || 'Anonymous';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Rate-limiting middleware ─────────────────────────────────
  io.use((socket: AuthenticatedSocket, next) => {
    const originalOnevent = (socket as any).onevent;
    (socket as any).onevent = function (packet: any) {
      const eventName = packet.data?.[0];
      if (eventName && typeof eventName === 'string') {
        if (!socketRateLimiter.consume(socket, eventName)) {
          socket.emit('error', {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded for event: ${eventName}`,
          });
          return;
        }
      }
      originalOnevent.call(this, packet);
    };
    next();
  });

  // ── Connection handler ──────────────────────────────────────
  io.on('connection', (socket: AuthenticatedSocket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);
    console.log(`[Socket] User connected: ${socket.userId}`);

    setupPresenceHandlers(io, socket);
    setupKanbanHandlers(io, socket);

    socket.on('error', (err) => {
      console.error(`[Socket] Error for user ${socket.userId}:`, err);
    });

    socket.on('disconnect', () => {
      socketRateLimiter.cleanup(socket.id);
      console.log(`[Socket] User disconnected: ${socket.userId}`);
    });
  });

  return io;
}
