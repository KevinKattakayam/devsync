import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { redis, isRedisAvailable } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { authorizeWorkspace } from '../security/workspace-policy';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

// ── Zod schemas for event payloads ───────────────────────────

const joinPayload = z.object({
  workspaceId: z.string().min(1).max(191),
  userName: z.string().min(1).max(191),
  avatar: z.string().url().max(2048).optional(),
});

const leavePayload = z.object({
  workspaceId: z.string().min(1).max(191),
});

const cursorPayload = z.object({
  workspaceId: z.string().min(1).max(191),
  documentId: z.string().min(1).max(191),
  cursor: z.object({
    anchor: z.number().int().min(0).max(10000000).optional(),
    head: z.number().int().min(0).max(10000000).optional(),
  }),
});

// ── Redis key builders ───────────────────────────────────────

const PRESENCE_KEY = (workspaceId: string) => `devsync:presence:${workspaceId}`;
const PRESENCE_TTL = 300; // 5 minutes — refreshed on activity

// ── Helpers ──────────────────────────────────────────────────

interface PresenceUser {
  socketId: string;
  name: string;
  avatar?: string;
}

async function getRedisPresence(
  workspaceId: string,
): Promise<{ id: string; socketId: string; name: string; avatar?: string }[]> {
  try {
    const data = await redis.hgetall(PRESENCE_KEY(workspaceId));
    return Object.entries(data).map(([userId, json]) => {
      const parsed = JSON.parse(json) as PresenceUser;
      return { id: userId, ...parsed };
    });
  } catch {
    return [];
  }
}

// ── In-memory fallback (used when Redis is unavailable) ──────

const inMemoryPresence = new Map<string, Map<string, PresenceUser>>();

function getMemoryPresence(
  workspaceId: string,
): { id: string; socketId: string; name: string; avatar?: string }[] {
  const users = inMemoryPresence.get(workspaceId);
  if (!users) return [];
  return Array.from(users.entries()).map(([id, data]) => ({ id, ...data }));
}

// ── Track which workspaces each socket joined (for disconnect cleanup) ──
const socketWorkspaces = new Map<string, Set<string>>();

export function setupPresenceHandlers(io: Server, socket: AuthenticatedSocket) {
  // ── Join workspace ───────────────────────────────────────
  socket.on('workspace:join', async (payload: unknown) => {
    const parsed = joinPayload.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }

    const { workspaceId, userName, avatar } = parsed.data;
    const userId = socket.userId!;
    const roomKey = `workspace:${workspaceId}`;

    try {
      await authorizeWorkspace(userId, workspaceId);
    } catch {
      socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
      return;
    }
    socket.join(roomKey);

    // Track socket → workspace mapping for disconnect cleanup
    if (!socketWorkspaces.has(socket.id)) {
      socketWorkspaces.set(socket.id, new Set());
    }
    socketWorkspaces.get(socket.id)!.add(workspaceId);

    const presenceData: PresenceUser = { socketId: socket.id, name: userName, avatar };

    const redisAvailable = await isRedisAvailable();
    if (redisAvailable) {
      await redis.hset(PRESENCE_KEY(workspaceId), userId, JSON.stringify(presenceData));
      await redis.expire(PRESENCE_KEY(workspaceId), PRESENCE_TTL);
      const users = await getRedisPresence(workspaceId);
      io.to(roomKey).emit('workspace:users', users);
    } else {
      if (!inMemoryPresence.has(workspaceId)) {
        inMemoryPresence.set(workspaceId, new Map());
      }
      inMemoryPresence.get(workspaceId)!.set(userId, presenceData);
      io.to(roomKey).emit('workspace:users', getMemoryPresence(workspaceId));
    }
  });

  // ── Leave workspace ──────────────────────────────────────
  socket.on('workspace:leave', async (payload: unknown) => {
    const parsed = leavePayload.safeParse(payload);
    if (!parsed.success) return;

    const { workspaceId } = parsed.data;
    const userId = socket.userId!;
    const roomKey = `workspace:${workspaceId}`;

    try {
      await authorizeWorkspace(userId, workspaceId);
    } catch {
      socket.leave(roomKey);
      socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
      return;
    }
    socket.leave(roomKey);
    socketWorkspaces.get(socket.id)?.delete(workspaceId);

    const redisAvailable = await isRedisAvailable();
    if (redisAvailable) {
      await redis.hdel(PRESENCE_KEY(workspaceId), userId);
      const users = await getRedisPresence(workspaceId);
      io.to(roomKey).emit('workspace:users', users);
    } else {
      inMemoryPresence.get(workspaceId)?.delete(userId);
      io.to(roomKey).emit('workspace:users', getMemoryPresence(workspaceId));
    }
  });

  // ── Cursor update ────────────────────────────────────────
  socket.on('cursor:update', async (payload: unknown) => {
    const parsed = cursorPayload.safeParse(payload);
    if (!parsed.success) return;

    const { workspaceId, documentId, cursor } = parsed.data;
    try {
      await authorizeWorkspace(socket.userId!, workspaceId);
      const document = await prisma.withTenantTransaction(workspaceId, (tx) =>
        tx.document.findUnique({
          where: { id: documentId },
          select: { workspaceId: true, isArchived: true },
        }),
      );
      if (!document || document.workspaceId !== workspaceId || document.isArchived)
        throw new Error('Access denied');
    } catch {
      socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
      return;
    }
    socket.to(`document:${documentId}`).emit('cursor:updated', {
      userId: socket.userId,
      cursor,
    });
  });

  // ── Cleanup on disconnect ────────────────────────────────
  socket.on('disconnect', async () => {
    const userId = socket.userId!;
    const workspaces = socketWorkspaces.get(socket.id);
    socketWorkspaces.delete(socket.id);

    if (!workspaces) return;

    const redisAvailable = await isRedisAvailable();

    for (const workspaceId of workspaces) {
      const roomKey = `workspace:${workspaceId}`;

      if (redisAvailable) {
        await redis.hdel(PRESENCE_KEY(workspaceId), userId);
        const users = await getRedisPresence(workspaceId);
        io.to(roomKey).emit('workspace:users', users);
      } else {
        inMemoryPresence.get(workspaceId)?.delete(userId);
        io.to(roomKey).emit('workspace:users', getMemoryPresence(workspaceId));
      }
    }
  });
}
