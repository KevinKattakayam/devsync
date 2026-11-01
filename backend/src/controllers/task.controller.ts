import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import {
  READ_ROLES,
  WRITE_ROLES,
  withResourceAccess,
  withWorkspaceAccess,
} from '../security/workspace-policy';
import { queueEmbedding } from '../services/embedding.service';
import { isRedisAvailable } from '../lib/redis';
import { getQueue, QueueNames } from '../lib/queue';
import { emitWorkspace } from '../socket';

const taskInclude = { assignee: { select: { id: true, name: true, avatar: true } }, labels: true };
async function withColumnAccess<T>(
  userId: string,
  columnId: string,
  operation: (tx: TenantTransaction, workspaceId: string) => Promise<T>,
): Promise<T> {
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { workspaceId: true } } },
  });
  if (!column) throw new ForbiddenError('Access denied');
  const workspaceId = column.board.workspaceId;
  return withWorkspaceAccess(userId, workspaceId, WRITE_ROLES, async (tx) => {
    await requireColumn(tx, columnId, workspaceId);
    return operation(tx, workspaceId);
  });
}
async function requireColumn(tx: TenantTransaction, columnId: string, workspaceId: string) {
  const column = await tx.column.findUnique({
    where: { id: columnId },
    include: { board: { select: { workspaceId: true } } },
  });
  if (!column || column.board.workspaceId !== workspaceId)
    throw new ForbiddenError('Access denied');
  return column;
}
async function requireAssignee(
  tx: TenantTransaction,
  workspaceId: string,
  assigneeId?: string | null,
) {
  if (!assigneeId) return;
  const member = await tx.workspaceMember.findUnique({
    where: { userId_workspaceId: { workspaceId, userId: assigneeId } },
    include: { user: { select: { isActive: true } } },
  });
  if (!member?.user.isActive) throw new ForbiddenError('Access denied');
}
/** Workspace write lock held by policy: serialize source/target ordering together. */
async function reorder(tx: TenantTransaction, taskId: string, targetId: string, position: number) {
  const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
  const source = await tx.task.findMany({
    where: { columnId: task.columnId, id: { not: taskId } },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const target =
    task.columnId === targetId
      ? source
      : await tx.task.findMany({
          where: { columnId: targetId, id: { not: taskId } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
  target.splice(Math.min(position, target.length), 0, { id: taskId });
  if (task.columnId !== targetId)
    for (const [index, item] of source.entries())
      await tx.task.update({ where: { id: item.id }, data: { position: index } });
  for (const [index, item] of target.entries())
    await tx.task.update({ where: { id: item.id }, data: { position: index, columnId: targetId } });
  return task.columnId;
}

export const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createColumnSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  taskKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9]+-\d+$/)
    .optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().min(1).max(191).optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  taskKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9]+-\d+$/)
    .nullable()
    .optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().min(1).max(191).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  position: z.number().int().min(0).max(1000000).optional(),
  columnId: z.string().min(1).max(191).optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().min(1).max(191),
  position: z.number().int().min(0),
});

export async function getBoards(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    res.json(
      await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
        tx.board.findMany({
          where: { workspaceId },
          include: {
            columns: {
              orderBy: { position: 'asc' },
              include: { tasks: { orderBy: { position: 'asc' }, include: taskInclude } },
            },
          },
        }),
      ),
    );
  } catch (error) {
    next(error);
  }
}
export async function createBoard(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const { name } = createBoardSchema.parse(req.body);
    const board = await withWorkspaceAccess(req.user!.userId, workspaceId, WRITE_ROLES, (tx) =>
      tx.board.create({
        data: {
          name,
          workspaceId,
          columns: {
            create: [
              { name: 'To Do', position: 0 },
              { name: 'In Progress', position: 1 },
              { name: 'Done', position: 2 },
            ],
          },
        },
        include: { columns: { orderBy: { position: 'asc' } } },
      }),
    );
    res.status(201).json(board);
  } catch (error) {
    next(error);
  }
}
export async function createColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const boardId = String(req.params.boardId);
    const { name } = createColumnSchema.parse(req.body);
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true },
    });
    if (!board) throw new NotFoundError('Board not found');
    const column = await withWorkspaceAccess(
      req.user!.userId,
      board.workspaceId,
      WRITE_ROLES,
      async (tx) => {
        const current = await tx.board.findUnique({
          where: { id: boardId },
          select: { workspaceId: true },
        });
        if (!current || current.workspaceId !== board.workspaceId)
          throw new ForbiddenError('Access denied');
        const max = await tx.column.findFirst({
          where: { boardId },
          orderBy: { position: 'desc' },
        });
        return tx.column.create({ data: { name, boardId, position: (max?.position ?? -1) + 1 } });
      },
    );
    res.status(201).json(column);
  } catch (error) {
    next(error);
  }
}
export async function updateColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.columnId);
    const data = updateColumnSchema.parse(req.body);
    res.json(
      await withColumnAccess(req.user!.userId, id, (tx) =>
        tx.column.update({ where: { id }, data }),
      ),
    );
  } catch (error) {
    next(error);
  }
}
export async function deleteColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.columnId);
    await withColumnAccess(req.user!.userId, id, (tx) => tx.column.delete({ where: { id } }));
    res.json({ message: 'Column deleted' });
  } catch (error) {
    next(error);
  }
}
export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const columnId = String(req.params.columnId);
    const { dueDate, ...data } = createTaskSchema.parse(req.body);
    const task = await withColumnAccess(req.user!.userId, columnId, async (tx, workspaceId) => {
      await requireAssignee(tx, workspaceId, data.assigneeId);
      const max = await tx.task.findFirst({ where: { columnId }, orderBy: { position: 'desc' } });
      const result = await tx.task.create({
        data: {
          ...data,
          columnId,
          position: (max?.position ?? -1) + 1,
          dueDate: dueDate ? new Date(dueDate) : undefined,
        },
        include: taskInclude,
      });
      await tx.activity.create({
        data: {
          type: 'task_created',
          message: `created task "${result.title}"`,
          userId: req.user!.userId,
          workspaceId,
        },
      });
      await queueEmbedding('task', result.id, tx, workspaceId, req.user!.userId);
      return result;
    });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
}
export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.taskId);
    const { dueDate, position, columnId, ...data } = updateTaskSchema.parse(req.body);
    const task = await withResourceAccess(
      req.user!.userId,
      'task',
      id,
      WRITE_ROLES,
      async (tx, workspaceId) => {
        await requireAssignee(tx, workspaceId, data.assigneeId);
        if (columnId !== undefined || position !== undefined) {
          const existing = await tx.task.findUniqueOrThrow({ where: { id } });
          const targetId = columnId ?? existing.columnId;
          await requireColumn(tx, targetId, workspaceId);
          await reorder(tx, id, targetId, position ?? existing.position);
        }
        const result = await tx.task.update({
          where: { id },
          data: {
            ...data,
            ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          },
          include: taskInclude,
        });
        await queueEmbedding('task', result.id, tx, workspaceId, req.user!.userId);
        return result;
      },
    );
    res.json(task);
  } catch (error) {
    next(error);
  }
}
export async function deleteTask(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.taskId);
    await withResourceAccess(req.user!.userId, 'task', id, WRITE_ROLES, async (tx) => {
      const task = await tx.task.delete({ where: { id } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, position: { gt: task.position } },
        data: { position: { decrement: 1 } },
      });
    });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
}
export async function moveTask(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.taskId);
    const { columnId, position } = moveTaskSchema.parse(req.body);
    const { task, workspaceId, fromColumnId } = await withResourceAccess(
      req.user!.userId,
      'task',
      id,
      WRITE_ROLES,
      async (tx, workspaceId) => {
        await requireColumn(tx, columnId, workspaceId);
        const fromColumnId = await reorder(tx, id, columnId, position);
        const task = await tx.task.findUniqueOrThrow({
          where: { id },
          include: {
            ...taskInclude,
            column: { select: { name: true, board: { select: { workspaceId: true } } } },
          },
        });
        return { task, workspaceId, fromColumnId };
      },
    );
    if (task.column.name.toLowerCase() === 'done') {
      try {
        if (await isRedisAvailable())
          await getQueue(QueueNames.TASK_COMPLETION).add(
            'task-completed',
            {
              taskId: task.id,
              taskTitle: task.title,
              taskKey: task.taskKey,
              columnName: task.column.name,
              workspaceId,
              actorId: req.user!.userId,
            },
            { jobId: `task-done-${task.id}-${Date.now()}` },
          );
      } catch {
        console.warn('[Task] Completion job dispatch failed');
      }
    }
    emitWorkspace(workspaceId, 'kanban:task-moved', {
      taskId: task.id,
      fromColumnId,
      toColumnId: columnId,
      position: task.position,
      task,
    });
    res.json(task);
  } catch (error) {
    next(error);
  }
}
