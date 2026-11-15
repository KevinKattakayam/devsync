import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { Virtuoso } from 'react-virtuoso';
import { KanbanTaskCard } from '@/components/kanban/task-card';
import { findMoveTarget } from '@/components/kanban/move-guard';
import type { Board, Column, Task } from '@/types';

const initialTasks: Task[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `t-${i}`,
  title: `Task ${i + 1}`,
  columnId: 'todo',
  priority: 'MEDIUM',
  position: i,
  labels: [],
}));
const initialBoard: Board = {
  id: 'board',
  name: 'Fixture',
  columns: [
    { id: 'todo', name: 'To do', position: 0, tasks: initialTasks },
    { id: 'done', name: 'Done', position: 1, tasks: [] },
  ],
};

function TaskRow({
  task,
  columns,
  move,
}: {
  task: Task;
  columns: Column[];
  move: (id: string, destination: string) => void;
}) {
  const drag = useDraggable({ id: task.id });
  return (
    <div data-task-id={task.id}>
      <KanbanTaskCard
        task={task}
        columns={columns}
        canWrite
        busy={false}
        dragAdapter={{ attributes: drag.attributes, listeners: drag.listeners }}
        dragNodeRef={drag.setNodeRef}
        dragHandleRef={drag.setActivatorNodeRef}
        onOpen={() => {}}
        onDragStart={(event) => event.preventDefault()}
        onDragEnd={() => {}}
        onMove={(destination) => move(task.id, destination)}
      />
    </div>
  );
}

function BoardColumn({
  column,
  columns,
  move,
}: {
  column: Column;
  columns: Column[];
  move: (id: string, destination: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <section aria-label={column.name}>
      <h2>
        {column.name} ({column.tasks.length})
      </h2>
      <div
        ref={setNodeRef}
        data-drop-target={column.id}
        style={{ padding: 12, border: '1px solid', minHeight: 44 }}
      >
        Drop in {column.name}
      </div>
      <div role="group" aria-label={`${column.name} tasks`} tabIndex={0}>
        <Virtuoso
          data={column.tasks}
          style={{ height: 420, width: 320 }}
          computeItemKey={(_, task) => task.id}
          itemContent={(_, task) => <TaskRow task={task} columns={columns} move={move} />}
        />
      </div>
    </section>
  );
}

export function TwoColumnFixture() {
  const [board, setBoard] = useState(initialBoard);
  const [dragId, setDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('Ready');
  const move = (id: string, destination: string) => {
    setBoard((current) => {
      const task = findMoveTarget([current], id, destination, true, false);
      if (!task) return current;
      return {
        ...current,
        columns: current.columns.map((column) => ({
          ...column,
          tasks:
            column.id === destination
              ? [{ ...task, columnId: destination }, ...column.tasks]
              : column.tasks.filter((item) => item.id !== id),
        })),
      };
    });
  };
  return (
    <main>
      <h1>Two-column virtualization fixture</h1>
      <p role="status">{announcement}</p>
      <DndContext
        onDragStart={({ active }) => {
          setDragId(String(active.id));
          setAnnouncement(`Dragging ${active.id}`);
        }}
        onDragCancel={() => {
          setDragId(null);
          setAnnouncement('Drag cancelled');
        }}
        onDragEnd={({ active, over }) => {
          setDragId(null);
          if (over) {
            move(String(active.id), String(over.id));
            setAnnouncement(`Drop requested for ${active.id}`);
          } else setAnnouncement('No drop target');
        }}
      >
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto' }}>
          {board.columns.map((column) => (
            <BoardColumn key={column.id} column={column} columns={board.columns} move={move} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragId ? <div>Dragging {dragId}</div> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<TwoColumnFixture />);
