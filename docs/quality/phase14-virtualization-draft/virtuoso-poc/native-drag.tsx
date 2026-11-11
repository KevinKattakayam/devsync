import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
export function App() {
  const [items, setItems] = useState(() =>
    Array.from({ length: 1000 }, (_, i) => ({ id: `task-${i}`, title: `Task ${i}` })),
  );
  const [drag, setDrag] = useState('');
  const [events, setEvents] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useRef<VirtuosoHandle>(null);
  const close = () => {
    const id = open;
    setOpen(null);
    const index = items.findIndex((x) => x.id === id);
    if (index >= 0)
      list.current?.scrollIntoView({
        index,
        done: () =>
          requestAnimationFrame(() =>
            document.querySelector<HTMLButtonElement>(`[data-task="${id}"] button`)?.focus(),
          ),
      });
  };
  return (
    <main>
      <h1>Isolated Virtuoso fixture</h1>
      <p id="events">{events}</p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Virtuoso
          ref={list}
          style={{ height: 400, width: 'min(600px, 90vw)', border: '1px solid' }}
          data={items}
          computeItemKey={(_, item) => item.id}
          itemContent={(index, item) => (
            <div
              data-task={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                setDrag(item.id);
                setEvents('dragstart');
              }}
              onDragEnd={() => {
                setDrag('');
                setEvents((e) => e + ' dragend');
              }}
              style={{ padding: 12, borderBottom: '1px solid' }}
            >
              <button onClick={() => setOpen(item.id)}>{item.title}</button>
              <span> item {index + 1}</span>
              {index === 0 && (
                <p data-long-content>
                  Long fixture text checks measured row height when the viewport changes. Long
                  fixture text checks measured row height when the viewport changes.
                </p>
              )}
              {drag === item.id ? ' dragging' : ''}
            </div>
          )}
        />
        <div
          id="drop"
          style={{ height: 150, width: 200, border: '2px solid', padding: 20 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            setItems((old) => {
              const item = old.find((x) => x.id === id);
              return item ? [...old.filter((x) => x.id !== id), item] : old;
            });
            setDrag('');
            setEvents((e) => e + ' drop:' + id);
          }}
        >
          Drop here to move to end
        </div>
      </div>
      {open && (
        <div role="dialog" aria-label="Task details">
          <p>{open}</p>
          <button onClick={close}>Close</button>
        </div>
      )}
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
