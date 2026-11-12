import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KanbanTaskCard } from '@/components/kanban/task-card';
import { findMoveTarget } from '@/components/kanban/move-guard';
import { Drawer, DrawerContent } from '@/components/ui';
import type { Board, Task } from '@/types';
import './style.css';

const original: Task = {
  id: 't',
  title: 'Fixture task',
  columnId: 'todo',
  priority: 'MEDIUM',
  position: 0,
  labels: [],
};
const initial: Board[] = [
  {
    id: 'board',
    name: 'Fixture board',
    columns: [
      { id: 'todo', name: 'To do', position: 0, tasks: [original] },
      { id: 'done', name: 'Done', position: 1, tasks: [] },
    ],
  },
];

function Fixture() {
  const [boards, setBoards] = useState(initial);
  const [canWrite, setCanWrite] = useState(true);
  const [message, setMessage] = useState('idle');
  const [selected, setSelected] = useState<Task | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nativeDragActive = useRef(false);

  useEffect(() => {
    const change = (event: Event) => {
      const kind = (event as CustomEvent<string>).detail;
      if (kind === 'revoke') setCanWrite(false);
      if (kind === 'delete' || kind === 'update')
        setBoards((current) =>
          current.map((board) => ({
            ...board,
            columns: board.columns.map((column) => ({
              ...column,
              tasks:
                kind === 'delete'
                  ? column.tasks.filter((task) => task.id !== 't')
                  : column.tasks.map((task) =>
                      task.id === 't' ? { ...task, title: 'Updated task', position: 7 } : task,
                    ),
            })),
          })),
        );
    };
    window.addEventListener('fixture-change', change);
    return () => window.removeEventListener('fixture-change', change);
  }, []);

  const move = (taskId: string, destination: string) => {
    const task = findMoveTarget(boards, taskId, destination, canWrite, false);
    if (!task) {
      setMessage('denied');
      return;
    }
    setMessage(`moved:${task.title}:${task.position}`);
    setBoards((current) =>
      current.map((board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          tasks:
            column.id === destination
              ? [
                  { ...task, columnId: destination },
                  ...column.tasks.filter((item) => item.id !== task.id),
                ]
              : column.tasks.filter((item) => item.id !== task.id),
        })),
      })),
    );
  };

  return (
    <main>
      <h1 ref={heading} tabIndex={-1}>
        Fixture board
      </h1>
      <p>Controlled browser fixture; no server or Yjs persistence.</p>
      <p role="status" data-status={message}>
        {message}
      </p>
      <div className="board">
        {boards[0].columns.map((column) => (
          <section
            key={column.id}
            aria-label={column.name}
            data-column={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/plain');
              if (taskId) move(taskId, column.id);
              nativeDragActive.current = false;
            }}
          >
            <h2>{column.name}</h2>
            {column.tasks.map((task) => (
              <KanbanTaskCard
                key={task.id}
                task={task}
                columns={boards[0].columns}
                canWrite={canWrite}
                busy={false}
                onDragStart={(event) => {
                  if (!canWrite) {
                    event.preventDefault();
                    return;
                  }
                  nativeDragActive.current = true;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', task.id);
                  setMessage('dragstart');
                }}
                onDragEnd={() => {
                  if (nativeDragActive.current) setMessage('cancelled');
                  nativeDragActive.current = false;
                }}
                onOpen={(element) => {
                  if (element) trigger.current = element;
                  setSelected(task);
                }}
                onMove={(columnId) => move(task.id, columnId)}
              />
            ))}
          </section>
        ))}
      </div>
      <Drawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DrawerContent
          title="Task details"
          description="Fixture task details"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              if (trigger.current?.isConnected) trigger.current.focus();
              else heading.current?.focus();
            });
          }}
        >
          <p>{selected?.title}</p>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Fixture />);
