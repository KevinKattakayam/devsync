import { Server, Socket } from 'socket.io';
import { z } from 'zod';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

// ── Zod schemas ──────────────────────────────────────────────

const taskMovedPayload = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  fromColumnId: z.string().min(1),
  toColumnId: z.string().min(1),
  position: z.number().int().min(0),
  task: z.any(),
});

const taskCrudPayload = z.object({
  workspaceId: z.string().min(1),
  task: z.any(),
});

const taskDeletedPayload = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
});

/**
 * Real-time Kanban board event handlers.
 *
 * These events are emitted from the REST API controllers (via the `io` instance)
 * and relayed to all connected clients in the workspace room.
 * Clients can also emit these events directly for optimistic UI updates.
 */
export function setupKanbanHandlers(io: Server, socket: AuthenticatedSocket) {
  // ── Task moved between columns ────────────────────────────
  socket.on('kanban:task-moved', (payload: unknown) => {
    const parsed = taskMovedPayload.safeParse(payload);
    if (!parsed.success) {
      socket.emit('error', { code: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }

    const { workspaceId, ...data } = parsed.data;
    // Broadcast to all workspace members except sender
    socket.to(`workspace:${workspaceId}`).emit('kanban:task-moved', {
      userId: socket.userId,
      ...data,
    });
  });

  // ── Task created ──────────────────────────────────────────
  socket.on('kanban:task-created', (payload: unknown) => {
    const parsed = taskCrudPayload.safeParse(payload);
    if (!parsed.success) return;

    const { workspaceId, task } = parsed.data;
    socket.to(`workspace:${workspaceId}`).emit('kanban:task-created', {
      userId: socket.userId,
      task,
    });
  });

  // ── Task updated ──────────────────────────────────────────
  socket.on('kanban:task-updated', (payload: unknown) => {
    const parsed = taskCrudPayload.safeParse(payload);
    if (!parsed.success) return;

    const { workspaceId, task } = parsed.data;
    socket.to(`workspace:${workspaceId}`).emit('kanban:task-updated', {
      userId: socket.userId,
      task,
    });
  });

  // ── Task deleted ──────────────────────────────────────────
  socket.on('kanban:task-deleted', (payload: unknown) => {
    const parsed = taskDeletedPayload.safeParse(payload);
    if (!parsed.success) return;

    const { workspaceId, taskId } = parsed.data;
    socket.to(`workspace:${workspaceId}`).emit('kanban:task-deleted', {
      userId: socket.userId,
      taskId,
    });
  });
}

/**
 * Server-side emitter — called from REST controllers to broadcast Kanban events.
 * This is used when the change originates from an HTTP request (not a Socket event).
 */
export function emitKanbanEvent(
  io: Server,
  workspaceId: string,
  event: 'kanban:task-moved' | 'kanban:task-created' | 'kanban:task-updated' | 'kanban:task-deleted',
  data: Record<string, unknown>,
): void {
  io.to(`workspace:${workspaceId}`).emit(event, data);
}
