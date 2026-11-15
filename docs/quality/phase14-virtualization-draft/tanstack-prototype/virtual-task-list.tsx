'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import type { Task } from '@/types';

/** Keeps focused, dragged and open tasks mounted while rendering a measured window. */
export function VirtualTaskList({
  tasks,
  columnName,
  pinnedIds,
  renderTask,
}: {
  tasks: Task[];
  columnName: string;
  pinnedIds: string[];
  renderTask: (task: Task) => ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const getItemKey = useCallback((index: number) => tasks[index].id, [tasks]);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scroll.current,
    getItemKey,
    estimateSize: () => 140,
    gap: 8,
    overscan: 3,
    initialRect: { width: 300, height: 500 },
    rangeExtractor: (range) => {
      const indices = new Set(defaultRangeExtractor(range));
      for (const id of [...pinnedIds, focusedId]) {
        const index = tasks.findIndex((task) => task.id === id);
        if (index >= 0) indices.add(index);
      }
      return [...indices].sort((a, b) => a - b);
    },
  });
  const rows = virtualizer.getVirtualItems();
  const visibleStart = virtualizer.range?.startIndex ?? 0;
  const visibleEnd = virtualizer.range?.endIndex ?? 0;
  function moveWindow(index: number) {
    const target = Math.max(0, Math.min(tasks.length - 1, index));
    virtualizer.scrollToIndex(target, { align: 'start' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scroll.current?.querySelector<HTMLElement>(`[data-index="${target}"] button`)?.focus();
      });
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs">
          <button
            type="button"
            aria-label={`Previous tasks in ${columnName}`}
            className="rounded px-2 py-1 focus-visible:outline-2 focus-visible:outline-ring"
            disabled={visibleStart === 0}
            onClick={() => moveWindow(visibleStart - 1)}
          >
            Previous tasks
          </button>
          <span aria-live="polite">
            Showing {visibleStart + 1}–{Math.min(visibleEnd + 1, tasks.length)} of {tasks.length} in{' '}
            {columnName}
          </span>
        </div>
      )}
      <div
        ref={scroll}
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        role="region"
        aria-label={`${columnName} tasks`}
        tabIndex={0}
      >
        <div
          role="list"
          aria-label={`${columnName} task list`}
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {rows.map((row) => {
            const task = tasks[row.index];
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                role="listitem"
                aria-posinset={row.index + 1}
                aria-setsize={tasks.length}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${row.start}px)`,
                }}
                onFocusCapture={() => setFocusedId(task.id)}
              >
                {renderTask(task)}
              </div>
            );
          })}
        </div>
      </div>
      {tasks.length > 0 && (
        <button
          type="button"
          aria-label={`Next tasks in ${columnName}`}
          className="self-end rounded px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring"
          disabled={visibleEnd >= tasks.length - 1}
          onClick={() => moveWindow(visibleEnd + 1)}
        >
          Next tasks
        </button>
      )}
    </div>
  );
}
