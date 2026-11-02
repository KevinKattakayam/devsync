import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { redis, isRedisAvailable } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { authorizeWorkspace } from '../security/workspace-policy';
import { PresenceStore } from './presence-store';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
  userAvatar?: string;
}
const id = z.string().min(1).max(191);
const joinPayload = z.object({
  workspaceId: id,
  userName: z.string().min(1).max(191),
  avatar: z.string().url().max(2048).optional(),
});
const leavePayload = z.object({ workspaceId: id });
const cursorPayload = z.object({
  workspaceId: id,
  documentId: id,
  cursor: z.object({
    anchor: z.number().int().min(0).max(10000000).optional(),
    head: z.number().int().min(0).max(10000000).optional(),
  }),
});
const defaultPresence = new PresenceStore(redis, isRedisAvailable);
interface PresenceOptions {
  db?: TenantPrismaClient;
  store?: PresenceStore;
  forgetWorkspace?(workspaceId: string): void;
}

export function setupPresenceHandlers(
  io: Server,
  socket: AuthenticatedSocket,
  options: PresenceOptions = {},
) {
  const db = options.db ?? prisma;
  const store = options.store ?? defaultPresence;
  const workspaces = new Set<string>();
  const broadcast = async (workspaceId: string) => {
    io.to(`workspace:${workspaceId}`).emit('workspace:users', await store.users(workspaceId));
  };
  socket.on('workspace:join', (payload: unknown) =>
    store.run(async () => {
      const parsed = joinPayload.safeParse(payload);
      if (!parsed.success) {
        socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid workspace payload' });
        return;
      }
      const { workspaceId } = parsed.data;
      try {
        await authorizeWorkspace(socket.userId!, workspaceId, undefined, db);
      } catch {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
        return;
      }
      if (socket.connected === false) return;
      workspaces.add(workspaceId);
      await socket.join(`workspace:${workspaceId}`);
      await store.put(workspaceId, {
        id: socket.userId!,
        socketId: socket.id,
        name: socket.userName || 'Member',
        avatar: socket.userAvatar,
      });
      await broadcast(workspaceId);
    }),
  );
  socket.on('workspace:leave', (payload: unknown) =>
    store.run(async () => {
      const parsed = leavePayload.safeParse(payload);
      if (!parsed.success) return;
      const { workspaceId } = parsed.data;
      try {
        await authorizeWorkspace(socket.userId!, workspaceId, undefined, db);
      } catch {
        await socket.leave(`workspace:${workspaceId}`);
        workspaces.delete(workspaceId);
        options.forgetWorkspace?.(workspaceId);
        await store.remove(workspaceId, socket.userId!, socket.id);
        socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
        return;
      }
      await socket.leave(`workspace:${workspaceId}`);
      workspaces.delete(workspaceId);
      options.forgetWorkspace?.(workspaceId);
      await store.remove(workspaceId, socket.userId!, socket.id);
      await broadcast(workspaceId);
    }),
  );
  socket.on('cursor:update', (payload: unknown) =>
    store.run(async () => {
      const parsed = cursorPayload.safeParse(payload);
      if (!parsed.success) return;
      const { workspaceId, documentId, cursor } = parsed.data;
      try {
        await authorizeWorkspace(socket.userId!, workspaceId, undefined, db);
        const document = await db.withTenantTransaction(workspaceId, (tx) =>
          tx.document.findUnique({
            where: { id: documentId },
            select: { workspaceId: true, isArchived: true },
          }),
        );
        if (!document || document.workspaceId !== workspaceId || document.isArchived)
          throw new Error('Access denied');
        if (socket.connected !== false)
          socket
            .to(`document:${documentId}`)
            .emit('cursor:updated', { userId: socket.userId, cursor });
      } catch {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
      }
    }),
  );
  socket.on('disconnect', () =>
    store.run(async () => {
      for (const workspaceId of workspaces) {
        await store.remove(workspaceId, socket.userId!, socket.id);
        await broadcast(workspaceId);
      }
      workspaces.clear();
    }),
  );
}
