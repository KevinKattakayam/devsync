import type { Board, Task } from '@/types';

/** Resolve a move against the board and permission state at the time of the attempt. */
export function findMoveTarget(
  boards: Board[],
  taskId: string,
  destinationId: string,
  canWrite: boolean,
  busy: boolean,
): Task | null {
  if (!canWrite || busy || taskId.startsWith('local:')) return null;
  for (const board of boards) {
    if (!board.columns.some((column) => column.id === destinationId)) continue;
    for (const column of board.columns) {
      const task = column.tasks.find((item) => item.id === taskId);
      if (task) return task.columnId === destinationId ? null : task;
    }
  }
  return null;
}
