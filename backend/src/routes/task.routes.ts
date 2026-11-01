import { idempotencyKeyHeader } from '../lib/create-idempotency';
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createColumn,
  updateColumn,
  deleteColumn,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
  createColumnSchema,
  updateColumnSchema,
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
} from '../controllers/task.controller';

const router = Router();

router.use(authMiddleware);

// Column operations
router.post(
  '/boards/:boardId/columns',
  idempotencyKeyHeader,
  validate(createColumnSchema),
  createColumn,
);
router.patch('/columns/:columnId', validate(updateColumnSchema), updateColumn);
router.delete('/columns/:columnId', deleteColumn);

// Task operations
router.post(
  '/columns/:columnId/tasks',
  idempotencyKeyHeader,
  validate(createTaskSchema),
  createTask,
);
router.patch('/tasks/:taskId', validate(updateTaskSchema), updateTask);
router.delete('/tasks/:taskId', deleteTask);
router.patch('/tasks/:taskId/move', validate(moveTaskSchema), moveTask);

export default router;
