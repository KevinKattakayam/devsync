'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultKeyboardCoordinateGetter,
  useDraggable,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Virtuoso } from 'react-virtuoso';
import type { ListRange, VirtuosoHandle } from 'react-virtuoso';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { KanbanTaskCard } from '@/components/kanban/task-card';
import { findMoveTarget } from '@/components/kanban/move-guard';
import type { Board, Column, Task } from '@/types';

type VirtualizedBoardProps = {
  board: Board;
  canWrite: boolean;
  busy: boolean;
  addingToColumn: string | null;
  newTaskTitle: string;
  onNewTaskTitleChange: (value: string) => void;
  onStartAdd: (columnId: string) => void;
  onAdd: (columnId: string) => void;
  onCancelAdd: () => void;
  onOpen: (task: Task, trigger?: HTMLButtonElement) => void;
  onMove: (taskId: string, columnId: string) => void;
};

type VirtualizedColumnProps = Omit<VirtualizedBoardProps, 'board'> & {
  column: Column;
  columns: Column[];
  adding: boolean;
  onRangeChanged: (columnId: string, range: ListRange) => void;
  onVirtuosoRef: (columnId: string, handle: VirtuosoHandle | null) => void;
};

function VirtualizedTaskRow({
  task,
  columns,
  canWrite,
  busy,
  onOpen,
  onMove,
}: {
  task: Task;
  columns: Column[];
  canWrite: boolean;
  busy: boolean;
  onOpen: (task: Task, trigger?: HTMLButtonElement) => void;
  onMove: (taskId: string, columnId: string) => void;
}) {
  const drag = useDraggable({
    id: task.id,
    disabled: !canWrite || busy || task.id.startsWith('local:'),
    data: { taskId: task.id, columnId: task.columnId },
  });
  const dragPermissions = { 'aria-disabled': !canWrite || busy || task.id.startsWith('local:') };

  return (
    <div className="pb-2" data-task-row={task.id}>
      <KanbanTaskCard
        task={task}
        columns={columns}
        canWrite={canWrite}
        busy={busy}
        dragAdapter={{
          attributes: { ...drag.attributes, ...dragPermissions },
          listeners: drag.listeners,
        }}
        dragNodeRef={drag.setNodeRef}
        dragHandleRef={drag.setActivatorNodeRef}
        onOpen={(trigger) => onOpen(task, trigger)}
        onDragStart={(event) => event.preventDefault()}
        onDragEnd={() => undefined}
        onMove={(columnId) => onMove(task.id, columnId)}
      />
    </div>
  );
}

function VirtualizedColumn({
  column,
  columns,
  canWrite,
  busy,
  adding,
  newTaskTitle,
  onNewTaskTitleChange,
  onStartAdd,
  onAdd,
  onCancelAdd,
  onOpen,
  onMove,
  onRangeChanged,
  onVirtuosoRef,
}: VirtualizedColumnProps) {
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: !canWrite || busy,
  });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={`w-72 min-h-0 flex flex-col rounded-xl ${isOver ? 'bg-primary/5 ring-2 ring-primary/30' : 'bg-muted/30'}`}
      data-kanban-column={column.id}
    >
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 id={headingId} className="text-sm font-semibold">
            {column.name}
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {column.tasks.length}
          </span>
        </div>
        <button
          type="button"
          disabled={!canWrite || busy}
          aria-label={`Add task to ${column.name}`}
          onClick={() => onStartAdd(column.id)}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {adding && (
        <div className="glass-card p-3 mx-2 mb-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(event) => onNewTaskTitleChange(event.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:border-primary outline-none"
            placeholder="Task title..."
            aria-label={`New task title for ${column.name}`}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAdd(column.id);
              if (event.key === 'Escape') onCancelAdd();
            }}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => onAdd(column.id)}
              className="px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-medium"
            >
              Add
            </button>
            <button
              type="button"
              onClick={onCancelAdd}
              className="px-3 py-1.5 text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 px-2 pb-2" role="group" aria-label={`${column.name} tasks`}>
        <Virtuoso
          ref={(handle) => onVirtuosoRef(column.id, handle)}
          data={column.tasks}
          style={{ height: '100%' }}
          increaseViewportBy={{ top: 300, bottom: 300 }}
          computeItemKey={(_, task) => task.id}
          rangeChanged={(range) => onRangeChanged(column.id, range)}
          components={{
            EmptyPlaceholder: () => (
              <p className="px-2 py-4 text-sm text-muted-foreground">No tasks in this column.</p>
            ),
          }}
          itemContent={(_, task) => (
            <VirtualizedTaskRow
              task={task}
              columns={columns}
              canWrite={canWrite}
              busy={busy}
              onOpen={onOpen}
              onMove={onMove}
            />
          )}
        />
      </div>
    </section>
  );
}

function CurrentTaskDragOverlay({
  board,
  canWrite,
  busy,
}: Pick<VirtualizedBoardProps, 'board' | 'canWrite' | 'busy'>) {
  const { active } = useDndContext();
  const activeTask = board.columns
    .flatMap((column) => column.tasks)
    .find((task) => task.id === String(active?.id));

  return (
    <DragOverlay dropAnimation={null}>
      {activeTask && canWrite && !busy ? (
        <div aria-hidden="true" className="rounded-lg border bg-card p-3 shadow-xl opacity-90">
          <span className="text-sm font-medium break-words">{activeTask.title}</span>
        </div>
      ) : null}
    </DragOverlay>
  );
}

export function VirtualizedKanbanBoard(props: VirtualizedBoardProps) {
  const { board, canWrite, busy, onMove, ...columnProps } = props;
  const [announcement, setAnnouncement] = useState('');
  const focusHost = useRef<HTMLDivElement>(null);
  const focusedTask = useRef<{ id: string; columnId: string } | null>(null);
  const columnHandles = useRef(new Map<string, VirtuosoHandle>());
  const currentBoard = useRef(board);
  useEffect(() => {
    currentBoard.current = board;
  }, [board]);
  const onVirtuosoRef = useCallback((columnId: string, handle: VirtuosoHandle | null) => {
    if (handle) columnHandles.current.set(columnId, handle);
    else columnHandles.current.delete(columnId);
  }, []);
  const focusTask = useCallback((taskId: string) => {
    const locate = () => {
      const current = currentBoard.current;
      for (const column of current.columns) {
        const index = column.tasks.findIndex((task) => task.id === taskId);
        if (index >= 0) {
          focusedTask.current = { id: taskId, columnId: column.id };
          columnHandles.current.get(column.id)?.scrollToIndex({
            index,
            align: 'center',
            behavior: 'auto',
          });
          let attempts = 0;
          const focusMountedTask = () => {
            const row = Array.from(document.querySelectorAll<HTMLElement>('[data-task-row]')).find(
              (element) => element.dataset.taskRow === taskId,
            );
            const title = row?.querySelector<HTMLButtonElement>(
              'button:not([aria-label^="Drag "])',
            );
            if (title) {
              title.focus();
              setAnnouncement(`Focused ${column.tasks[index]?.title} in ${column.name}.`);
            } else if (attempts++ < 20) {
              requestAnimationFrame(focusMountedTask);
            } else {
              focusHost.current?.focus();
            }
          };
          requestAnimationFrame(focusMountedTask);
          return;
        }
      }
      focusedTask.current = null;
      focusHost.current?.focus();
      setAnnouncement('The focused task is no longer available. Focus returned to the task board.');
    };
    locate();
  }, []);
  const onRangeChanged = useCallback((columnId: string, range: ListRange) => {
    const active = focusedTask.current;
    if (active?.columnId !== columnId || document.activeElement !== document.body) return;
    const column = currentBoard.current.columns.find((item) => item.id === columnId);
    const index = column?.tasks.findIndex((task) => task.id === active.id) ?? -1;
    if (index >= range.startIndex && index <= range.endIndex) return;
    focusHost.current?.focus();
    const task = currentBoard.current.columns
      .flatMap((column) => column.tasks)
      .find((item) => item.id === active.id);
    setAnnouncement(
      task
        ? `${task.title} is outside the visible rows. Use the arrow keys to navigate the task board.`
        : 'The focused task is no longer available. Focus returned to the task board.',
    );
  }, []);
  const handleMove = useCallback(
    (taskId: string, destinationId: string) => {
      const task = findMoveTarget(
        currentBoard.current.columns.length ? [currentBoard.current] : [],
        taskId,
        destinationId,
        canWrite,
        busy,
      );
      if (!task) return;
      onMove(taskId, destinationId);
      requestAnimationFrame(() => focusTask(taskId));
    },
    [busy, canWrite, focusTask, onMove],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, { active, context, currentCoordinates }) => {
        if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
          const activeColumn = String(context.active?.data.current?.columnId ?? '');
          const currentIndex = board.columns.findIndex((column) => column.id === activeColumn);
          const nextIndex = currentIndex + (event.code === 'ArrowRight' ? 1 : -1);
          const destination = board.columns[nextIndex];
          const rect = destination ? context.droppableRects.get(destination.id) : undefined;
          if (rect)
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + Math.min(64, rect.height / 2),
            };
          return currentCoordinates;
        }
        return defaultKeyboardCoordinateGetter(event, {
          active,
          context,
          currentCoordinates,
        });
      },
    }),
  );
  const endDrag = (taskId: string, destinationId: string | null) => {
    if (!destinationId) {
      setAnnouncement('Task move cancelled.');
      return;
    }
    const task = findMoveTarget(
      board.columns.length ? [board] : [],
      taskId,
      destinationId,
      canWrite,
      busy,
    );
    if (!task) {
      setAnnouncement(
        'Task move was not applied because the task, destination, or permission changed.',
      );
      return;
    }
    setAnnouncement(
      `Moving ${task.title} to ${board.columns.find((column) => column.id === destinationId)?.name ?? 'the selected column'}.`,
    );
    handleMove(taskId, destinationId);
  };

  return (
    <div
      ref={focusHost}
      className="h-full min-h-0"
      role="region"
      aria-label="Kanban task board"
      aria-describedby="kanban-keyboard-navigation"
      tabIndex={0}
      data-kanban-focus-host
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-task-row]');
        if (!row?.dataset.taskRow) return;
        const task = currentBoard.current.columns
          .flatMap((column) => column.tasks)
          .find((item) => item.id === row.dataset.taskRow);
        if (task) focusedTask.current = { id: task.id, columnId: task.columnId };
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const all = currentBoard.current.columns.flatMap((column) =>
          column.tasks.map((task) => ({ task, columnId: column.id })),
        );
        if (!all.length || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
          return;
        event.preventDefault();
        const currentIndex = all.findIndex((item) => item.task.id === focusedTask.current?.id);
        let nextIndex = currentIndex < 0 ? 0 : currentIndex;
        if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
        if (event.key === 'ArrowDown') nextIndex = Math.min(all.length - 1, currentIndex + 1);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const currentColumn = focusedTask.current?.columnId;
          const columnIndex = currentBoard.current.columns.findIndex(
            (column) => column.id === currentColumn,
          );
          const targetColumn =
            currentBoard.current.columns[columnIndex + (event.key === 'ArrowRight' ? 1 : -1)];
          if (targetColumn) {
            const sourceColumn = currentBoard.current.columns[columnIndex];
            const sourceIndex =
              sourceColumn?.tasks.findIndex((task) => task.id === focusedTask.current?.id) ?? 0;
            const rowIndex = Math.min(Math.max(0, sourceIndex), targetColumn.tasks.length - 1);
            const task = targetColumn.tasks[Math.min(rowIndex, targetColumn.tasks.length - 1)];
            if (task) {
              focusTask(task.id);
              return;
            }
          }
          return;
        }
        if (all[nextIndex]) focusTask(all[nextIndex].task.id);
      }}
    >
      <p id="kanban-keyboard-navigation" className="sr-only">
        If a task row scrolls out of view while focused, focus moves to this board. Use arrow keys
        to navigate to a visible task, then Tab to its controls.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => {
          const taskId = String(active.id);
          const task = board.columns
            .flatMap((column) => column.tasks)
            .find((item) => item.id === taskId);
          if (!task || !canWrite || busy || taskId.startsWith('local:')) {
            setAnnouncement('Drag could not start because the task is unavailable or read only.');
            return;
          }
          setAnnouncement(`Picked up ${task.title}. Choose a destination column.`);
        }}
        onDragCancel={() => {
          setAnnouncement('Task move cancelled.');
        }}
        onDragEnd={({ active, over }) => endDrag(String(active.id), over ? String(over.id) : null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Press Space to pick up a task, use the arrow keys to choose a column, then press Space to drop or Escape to cancel.',
          },
          announcements: {
            onDragStart: ({ active }) => {
              const task = board.columns
                .flatMap((column) => column.tasks)
                .find((item) => item.id === String(active.id));
              return task ? `Picked up ${task.title}.` : 'Task unavailable.';
            },
            onDragOver: ({ active, over }) => {
              const task = board.columns
                .flatMap((column) => column.tasks)
                .find((item) => item.id === String(active.id));
              const column = board.columns.find((item) => item.id === String(over?.id));
              return task && column ? `${task.title} over ${column.name}.` : '';
            },
            onDragEnd: ({ active, over }) => {
              const task = board.columns
                .flatMap((column) => column.tasks)
                .find((item) => item.id === String(active.id));
              const column = board.columns.find((item) => item.id === String(over?.id));
              return task && column
                ? `${task.title} dropped in ${column.name}.`
                : 'Task move cancelled.';
            },
            onDragCancel: () => 'Task move cancelled.',
          },
        }}
      >
        <div className="flex gap-4 h-full min-h-0 min-w-max">
          {board.columns.map((column) => (
            <VirtualizedColumn
              key={column.id}
              {...columnProps}
              column={column}
              columns={board.columns}
              canWrite={canWrite}
              busy={busy}
              adding={columnProps.addingToColumn === column.id}
              onMove={handleMove}
              onRangeChanged={onRangeChanged}
              onVirtuosoRef={onVirtuosoRef}
            />
          ))}
        </div>
        <CurrentTaskDragOverlay board={board} canWrite={canWrite} busy={busy} />
      </DndContext>
    </div>
  );
}
