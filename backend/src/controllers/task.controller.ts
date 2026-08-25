import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { queueEmbedding } from '../services/embedding.service';
import { getQueue, QueueNames } from '../lib/queue';
import { isRedisAvailable } from '../lib/redis';

async function checkTaskEditorRole(userId: string, columnId?: string, taskId?: string) {
  let workspaceId: string | null = null;
  if (columnId) {
    const col = await prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });
    if (!col) throw new NotFoundError('Column not found');
    workspaceId = col.board.workspaceId;
  } else if (taskId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { column: { include: { board: true } } },
    });
    if (!task) throw new NotFoundError('Task not found');
    workspaceId = task.column.board.workspaceId;
  }

  if (workspaceId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!member || member.role === 'VIEWER') {
      throw new ForbiddenError('Requires EDITOR or OWNER role');
    }
  }
}

async function requireSameWorkspace(taskId: string, targetColumnId: string) {
  const [task, target] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, include: { column: { include: { board: true } } } }),
    prisma.column.findUnique({ where: { id: targetColumnId }, include: { board: true } }),
  ]);
  if (!task) throw new NotFoundError('Task not found');
  if (!target || task.column.board.workspaceId !== target.board.workspaceId) throw new ForbiddenError('Tasks cannot be moved across workspaces');
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
  taskKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  taskKey: z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/).nullable().optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  position: z.number().optional(),
  columnId: z.string().optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().min(1),
  position: z.number().int().min(0),
});

export async function getBoards(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const boards = await prisma.board.findMany({
      where: { workspaceId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: { id: true, name: true, avatar: true } },
                labels: true,
              },
            },
          },
        },
      },
    });
    res.json(boards);
  } catch (error) {
    next(error);
  }
}

export async function createBoard(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const board = await prisma.board.create({
      data: {
        name: req.body.name,
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
    });
    res.status(201).json(board);
  } catch (error) {
    next(error);
  }
}

export async function createColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const boardId = String(req.params.boardId);
    const maxPos = await prisma.column.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const column = await prisma.column.create({
      data: {
        name: req.body.name,
        boardId,
        position: (maxPos?.position ?? -1) + 1,
      },
    });
    res.status(201).json(column);
  } catch (error) {
    next(error);
  }
}

export async function updateColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const columnId = String(req.params.columnId);
    await checkTaskEditorRole(req.user!.userId, columnId);
    const column = await prisma.column.update({
      where: { id: columnId },
      data: { name: req.body.name },
    });
    res.json(column);
  } catch (error) {
    next(error);
  }
}

export async function deleteColumn(req: Request, res: Response, next: NextFunction) {
  try {
    const columnId = String(req.params.columnId);
    await checkTaskEditorRole(req.user!.userId, columnId);
    await prisma.column.delete({ where: { id: columnId } });
    res.json({ message: 'Column deleted' });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const columnId = String(req.params.columnId);
    if (req.user?.userId) {
      await checkTaskEditorRole(req.user.userId, columnId);
    }
    const { title, taskKey, description, priority, assigneeId, dueDate } = req.body;

    const maxPos = await prisma.task.findFirst({
      where: { columnId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        title,
        taskKey,
        description,
        priority: priority || 'MEDIUM',
        position: (maxPos?.position ?? -1) + 1,
        columnId,
        assigneeId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        labels: true,
      },
    });

    // Get workspace id for activity logging
    const column = await prisma.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    });

    if (column) {
      const board = await prisma.board.findUnique({
        where: { id: column.boardId },
        select: { workspaceId: true },
      });

      await prisma.activity.create({
        data: {
          type: 'task_created',
          message: `created task "${title}"`,
          userId: req.user!.userId,
          workspaceId: board!.workspaceId,
        },
      });
    }

    res.status(201).json(task);
    queueEmbedding('task', task.id);
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const taskId = String(req.params.taskId);
    if (req.user?.userId) {
      await checkTaskEditorRole(req.user.userId, undefined, taskId);
    }
    const { title, taskKey, description, priority, assigneeId, dueDate, position, columnId } = req.body;
    if (columnId) await requireSameWorkspace(taskId, columnId);

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined && { title }),
        ...(taskKey !== undefined && { taskKey }),
        ...(description !== undefined && { description }),
        ...(priority !== undefined && { priority }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(position !== undefined && { position }),
        ...(columnId !== undefined && { columnId }),
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        labels: true,
      },
    });

    res.json(task);
    queueEmbedding('task', task.id);
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction) {
  try {
    const taskId = String(req.params.taskId);
    if (req.user?.userId) {
      await checkTaskEditorRole(req.user.userId, undefined, taskId);
    }
    await prisma.task.delete({ where: { id: taskId } });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
}

export async function moveTask(req: Request, res: Response, next: NextFunction) {
  try {
    const { columnId, position } = req.body;
    const taskId = String(req.params.taskId);
    if (req.user?.userId) {
      await checkTaskEditorRole(req.user.userId, undefined, taskId);
    }
    await requireSameWorkspace(taskId, columnId);

    // Get source column for socket event
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { columnId: true },
    });
    const fromColumnId = existingTask?.columnId || '';

    // Update positions of other tasks in target column
    await prisma.task.updateMany({
      where: {
        columnId,
        position: { gte: position },
      },
      data: {
        position: { increment: 1 },
      },
    });

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { columnId, position },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        labels: true,
        column: { select: { name: true, board: { select: { workspaceId: true } } } },
      },
    });

    // Dispatch task-completion agent if task moved to "Done"
    const targetColumn = await prisma.column.findUnique({
      where: { id: columnId },
      select: { name: true },
    });

    if (targetColumn?.name.toLowerCase() === 'done') {
      const redisUp = await isRedisAvailable();
      if (redisUp) {
        await getQueue(QueueNames.TASK_COMPLETION).add(
          'task-completed',
          {
            taskId: task.id,
            taskTitle: task.title,
            taskKey: task.taskKey,
            columnName: targetColumn.name,
            workspaceId: task.column.board.workspaceId,
          },
          { jobId: `task-done-${task.id}-${Date.now()}` },
        );
      }
    }

    // Emit real-time event for Kanban board
    try {
      const { io } = await import('../server');
      const workspaceId = task.column.board.workspaceId;
      io.to(`workspace:${workspaceId}`).emit('kanban:task-moved', {
        taskId: task.id,
        fromColumnId,
        toColumnId: columnId,
        position,
        task,
      });
    } catch {
      // Socket emission is non-critical
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
}
