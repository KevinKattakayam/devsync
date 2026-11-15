import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Virtuoso } from 'react-virtuoso';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
function Row({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      data-task={id}
      {...attributes}
      {...listeners}
      style={{ padding: 12, borderBottom: '1px solid', touchAction: 'none' }}
    >
      <button>{id}</button>
    </div>
  );
}
function Drop() {
  const { setNodeRef } = useDroppable({ id: 'destination' });
  return (
    <div
      id="drop"
      ref={setNodeRef}
      style={{ height: 150, width: 200, border: '2px solid', padding: 20 }}
    >
      Destination
    </div>
  );
}
export function App() {
  const [items, setItems] = useState(() => Array.from({ length: 1000 }, (_, i) => `task-${i}`));
  const [active, setActive] = useState<string | null>(null);
  const [events, setEvents] = useState('');
  const sensors = useSensors(useSensor(PointerSensor));
  return (
    <main>
      <h1>Isolated overlay fixture</h1>
      <p id="events">{events}</p>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          setActive(String(e.active.id));
          setEvents('start');
        }}
        onDragCancel={() => {
          setActive(null);
          setEvents((e) => e + ' cancel');
        }}
        onDragEnd={(e) => {
          const id = String(e.active.id);
          if (e.over?.id === 'destination') {
            setItems((old) => [...old.filter((x) => x !== id), id]);
            setEvents((e) => e + ' drop:' + id);
          } else setEvents((e) => e + ' end-without-drop');
          setActive(null);
        }}
      >
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Virtuoso
            style={{ height: 400, width: 300, border: '1px solid' }}
            data={items}
            computeItemKey={(_, id) => id}
            itemContent={(_, id) => <Row id={id} />}
          />
          <Drop />
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div id="overlay" style={{ background: 'white', padding: 12 }}>
              {active}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
