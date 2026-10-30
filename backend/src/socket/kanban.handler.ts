import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authorizeWorkspace, WRITE_ROLES } from '../security/workspace-policy';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}
const id = z.string().min(1).max(191);
const taskRef = z.object({ id });
const base = z.object({ workspaceId: id });
const schemas = {
  'kanban:task-created': base.extend({ task: taskRef }),
  'kanban:task-updated': base.extend({ task: taskRef }),
  'kanban:task-deleted': base.extend({ taskId: id }),
  'kanban:task-moved': base.extend({
    taskId: id,
    fromColumnId: id,
    toColumnId: id,
    position: z.number().int().min(0).max(1000000),
    task: taskRef,
  }),
};
type KanbanEvent = keyof typeof schemas;

/** Existing event names retained; never forward untrusted task objects. */
export function setupKanbanHandlers(_io: Server, socket: AuthenticatedSocket) {
  for (const event of Object.keys(schemas) as KanbanEvent[]) {
    socket.on(event, async (payload: unknown) => {
      try {
        const input = schemas[event].parse(payload);
        const move =
          event === 'kanban:task-moved' ? schemas['kanban:task-moved'].parse(payload) : null;
        await authorizeWorkspace(socket.userId!, input.workspaceId, WRITE_ROLES);
        const taskId = 'taskId' in input ? input.taskId : input.task.id;
        const task = await prisma.withTenantTransaction(input.workspaceId, (tx) =>
          tx.task.findUnique({
            where: { id: taskId },
            include: {
              column: { include: { board: true } },
              assignee: { select: { id: true, name: true, avatar: true } },
              labels: true,
            },
          }),
        );
        if (!task || task.column.board.workspaceId !== input.workspaceId)
          throw new Error('Access denied');
        if (move) {
          for (const columnId of [move.fromColumnId, move.toColumnId]) {
            const column = await prisma.column.findUnique({
              where: { id: columnId },
              include: { board: true },
            });
            if (!column || column.board.workspaceId !== input.workspaceId)
              throw new Error('Access denied');
          }
          // A client cannot invent a move that has not been committed by REST.
          if (task.columnId !== move.toColumnId || task.position !== move.position)
            throw new Error('Access denied');
        }
        const data =
          event === 'kanban:task-deleted'
            ? { taskId }
            : move
              ? {
                  taskId,
                  task,
                  fromColumnId: move.fromColumnId,
                  toColumnId: move.toColumnId,
                  position: task.position,
                }
              : { task };
        socket.to(`workspace:${input.workspaceId}`).emit(event, { userId: socket.userId, ...data });
      } catch {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Event rejected' });
      }
    });
  }
}

export function emitKanbanEvent(
  io: Server,
  workspaceId: string,
  event: KanbanEvent,
  data: Record<string, unknown>,
): void {
  io.to(`workspace:${workspaceId}`).emit(event, data);
}
