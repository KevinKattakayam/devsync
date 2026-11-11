import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
export function App() {
  const [active, setActive] = useState(0);
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState('To do');
  const list = useRef<VirtuosoHandle>(null);
  const host = useRef<HTMLElement>(null);
  const visible = active >= range.startIndex && active <= range.endIndex;
  function move(index: number) {
    const next = Math.min(999, Math.max(0, index));
    setActive(next);
    list.current?.scrollToIndex({ index: next, align: 'center' });
  }
  return (
    <main>
      <h1>Isolated focus host fixture</h1>
      <p id="hint">Use arrow keys to navigate tasks and Enter to open details.</p>
      <Virtuoso
        ref={list}
        scrollerRef={(element) => {
          host.current = element instanceof HTMLElement ? element : null;
        }}
        role="grid"
        tabIndex={0}
        aria-label="Tasks"
        aria-describedby="hint"
        aria-rowcount={1000}
        aria-activedescendant={visible ? `row-${active}` : undefined}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(active + 1);
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(active - 1);
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        style={{ height: 400, width: 'min(600px,90vw)', border: '1px solid' }}
        totalCount={1000}
        computeItemKey={(i) => `task-${i}`}
        rangeChanged={setRange}
        itemContent={(index) => (
          <div
            role="row"
            id={`row-${index}`}
            aria-rowindex={index + 1}
            data-task={index}
            style={{
              padding: 12,
              borderBottom: '1px solid',
              outline: index === active ? '2px solid blue' : undefined,
            }}
          >
            <span role="gridcell">Task {index}</span>
          </div>
        )}
      />
      <p role="status" aria-live="polite">
        Active task {active + 1} of 1000
        {visible ? '' : ' — offscreen; use arrow keys to return to the list'}
      </p>
      <div role="group" aria-label="Active fixture task actions">
        <button type="button" onClick={() => setOpen(true)}>
          Open Task {active}
        </button>
        <label>
          Move Task {active}
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option>To do</option>
            <option>Done</option>
          </select>
        </label>
        <button type="button">After list</button>
      </div>
      {open && (
        <div role="dialog" aria-label="Task details">
          <p>Task {active}</p>
          <button
            autoFocus
            onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => host.current?.focus());
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                requestAnimationFrame(() => host.current?.focus());
              }
            }}
          >
            Close
          </button>
        </div>
      )}
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
