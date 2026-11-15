import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { KanbanTaskCard } from '@/components/kanban/task-card';
import './style.css';

function Card({ canWrite }: { canWrite: boolean }) {
  const drag = useDraggable({ id: 't', disabled: !canWrite });
  return (
    <KanbanTaskCard
      task={{
        id: 't',
        title: 'Adapter task',
        columnId: 'todo',
        priority: 'MEDIUM',
        position: 0,
        labels: [],
      }}
      columns={[{ id: 'todo', name: 'To do' }]}
      canWrite={canWrite}
      busy={false}
      dragAdapter={{ attributes: drag.attributes, listeners: drag.listeners }}
      dragNodeRef={drag.setNodeRef}
      dragHandleRef={drag.setActivatorNodeRef}
      onOpen={() => {}}
      onDragStart={(event) => event.preventDefault()}
      onDragEnd={() => {}}
      onMove={() => {}}
    />
  );
}
function Fixture() {
  const [canWrite, setCanWrite] = useState(true);
  const [status, setStatus] = useState('idle');
  return (
    <main>
      <h1>Adapter fixture</h1>
      <p role="status">{status}</p>
      <button onClick={() => setCanWrite(false)}>Revoke write</button>
      <DndContext
        onDragStart={() => setStatus('dragging')}
        onDragCancel={() => setStatus('cancelled')}
      >
        <Card canWrite={canWrite} />
      </DndContext>
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Fixture />);
