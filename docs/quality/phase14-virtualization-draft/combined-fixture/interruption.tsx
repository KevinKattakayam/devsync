import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { KanbanTaskCard } from '@/components/kanban/task-card';
import type { Task } from '@/types';

const initial: Task[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `t-${i}`,
  title: `Task ${i + 1}`,
  columnId: 'todo',
  priority: 'MEDIUM',
  position: i,
  labels: [],
}));
type Session = {
  epoch: number;
  dragId: string | null;
  tasks: Task[];
  canWrite: boolean;
  start: (id: string) => void;
  finish: (id: string, target: string | null) => void;
  cancel: () => void;
};
const SessionContext = createContext<Session | null>(null);
function Destination() {
  const { setNodeRef } = useDroppable({ id: 'done' });
  return (
    <div ref={setNodeRef} data-destination style={{ padding: 20 }}>
      Done destination
    </div>
  );
}
const VirtualList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function VirtualList(
  { children, ...props },
  ref,
) {
  const session = useContext(SessionContext);
  const sensors = useSensors(useSensor(PointerSensor));
  if (!session) return null;
  return (
    <DndContext
      key={session.epoch}
      sensors={sensors}
      onDragStart={({ active }) => session.start(String(active.id))}
      onDragEnd={({ active, over }) =>
        session.finish(String(active.id), over ? String(over.id) : null)
      }
      onDragCancel={session.cancel}
    >
      <div {...props} ref={ref}>
        {children}
      </div>
      <Destination />
      <DragOverlay dropAnimation={null}>
        {session.dragId &&
        session.canWrite &&
        session.tasks.some((t) => t.id === session.dragId) ? (
          <div data-overlay>Dragging {session.dragId}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});
const components = { List: VirtualList };
function Row({
  task,
  canWrite,
  move,
  open,
}: {
  task: Task;
  canWrite: boolean;
  move: (id: string, column: string) => void;
  open: (id: string) => void;
}) {
  const drag = useDraggable({ id: task.id, disabled: !canWrite });
  return (
    <div id={`row-${task.id}`} data-row={task.id}>
      <KanbanTaskCard
        task={task}
        columns={[
          { id: 'todo', name: 'To do' },
          { id: 'done', name: 'Done' },
        ]}
        canWrite={canWrite}
        busy={false}
        dragAdapter={{ attributes: drag.attributes, listeners: drag.listeners }}
        dragNodeRef={drag.setNodeRef}
        dragHandleRef={drag.setActivatorNodeRef}
        onOpen={() => open(task.id)}
        onDragStart={(event) => event.preventDefault()}
        onDragEnd={() => {}}
        onMove={(column) => move(task.id, column)}
      />
    </div>
  );
}
export function InterruptionFixture() {
  const [tasks, setTasks] = useState(initial);
  const [canWrite, setCanWrite] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState('t-0');
  const [epoch, setEpoch] = useState(0);
  const [moves, setMoves] = useState(0);
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });
  const host = useRef<HTMLDivElement>(null);
  const list = useRef<VirtuosoHandle>(null);
  const selectedIndex = tasks.findIndex((task) => task.id === activeId);
  const selected = tasks[selectedIndex];
  const focusHost = useCallback(() => requestAnimationFrame(() => host.current?.focus()), []);
  useEffect(() => {
    function interrupt(event: Event) {
      const kind = (event as CustomEvent<string>).detail;
      if (kind === 'delete' && dragId) {
        const index = tasks.findIndex((task) => task.id === dragId);
        setActiveId(tasks[index + 1]?.id ?? tasks[index - 1]?.id ?? '');
        setTasks((previous) => previous.filter((task) => task.id !== dragId));
      } else if (kind === 'revoke') setCanWrite(false);
      else if (kind === 'restore') {
        setCanWrite(true);
        return;
      } else return;
      setDragId(null);
      setEpoch((value) => value + 1);
      focusHost();
    }
    window.addEventListener('fixture-interrupt', interrupt);
    return () => window.removeEventListener('fixture-interrupt', interrupt);
  }, [dragId, tasks, focusHost]);
  const move = (id: string, column: string) => {
    if (canWrite && tasks.some((task) => task.id === id) && column === 'done')
      setMoves((value) => value + 1);
  };
  return (
    <main data-epoch={epoch} data-moves={moves} data-active={activeId}>
      <h1>Interruptible virtual list</h1>
      <p role="status">
        {selected
          ? `${selected.title}, task ${selectedIndex + 1} of ${tasks.length}`
          : 'No active task'}
      </p>
      <div
        ref={host}
        tabIndex={0}
        role="group"
        aria-label="Task navigation"
        aria-activedescendant={
          selectedIndex >= range.startIndex && selectedIndex <= range.endIndex
            ? `row-${activeId}`
            : undefined
        }
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.key !== 'ArrowDown') return;
          event.preventDefault();
          const index = Math.min(selectedIndex + 1, tasks.length - 1);
          const task = tasks[index];
          if (task) {
            setActiveId(task.id);
            list.current?.scrollToIndex({ index, align: 'center' });
          }
        }}
      >
        <SessionContext.Provider
          value={{
            epoch,
            dragId,
            tasks,
            canWrite,
            start: (id) => {
              setDragId(id);
              setActiveId(id);
            },
            finish: (id, target) => {
              setDragId(null);
              if (target) move(id, target);
              focusHost();
            },
            cancel: () => {
              setDragId(null);
              focusHost();
            },
          }}
        >
          <Virtuoso
            ref={list}
            data={tasks}
            style={{ height: 420, width: 320 }}
            components={components}
            rangeChanged={setRange}
            computeItemKey={(_, task) => task.id}
            itemContent={(_, task) => (
              <Row task={task} canWrite={canWrite} move={move} open={(id) => setActiveId(id)} />
            )}
          />
        </SessionContext.Provider>
      </div>
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<InterruptionFixture />);
