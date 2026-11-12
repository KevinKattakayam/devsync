'use client';

import type { DragEvent } from 'react';
import { useState } from 'react';
import type { Task } from '@/types';
import { generateColor, getInitials } from '@/lib/utils';
import { Select } from '@/components/ui';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

export type KanbanDragAdapter = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

const priorityConfig: Record<string, { color: string; bg: string; label: string }> = {
  LOW: { color: 'text-foreground', bg: 'bg-secondary', label: 'Low' },
  MEDIUM: { color: 'text-foreground', bg: 'bg-secondary', label: 'Medium' },
  HIGH: { color: 'text-foreground', bg: 'bg-secondary', label: 'High' },
  URGENT: { color: 'text-foreground', bg: 'bg-secondary', label: 'Urgent' },
};

export function KanbanTaskCard({
  task,
  columns,
  canWrite,
  busy,
  dragAdapter,
  dragNodeRef,
  dragHandleRef,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: Task;
  columns: { id: string; name: string }[];
  canWrite: boolean;
  busy: boolean;
  dragAdapter?: KanbanDragAdapter;
  dragNodeRef?: (element: HTMLElement | null) => void;
  dragHandleRef?: (element: HTMLElement | null) => void;
  onOpen: (trigger?: HTMLButtonElement) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
  onMove: (columnId: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const priority = priorityConfig[task.priority?.toUpperCase()] || priorityConfig.MEDIUM;
  return (
    <div ref={dragNodeRef} className="rounded-lg bg-card p-3">
      <div
        draggable={!dragAdapter && canWrite && !busy}
        onDragStart={(event) => {
          if (dragAdapter || !canWrite || busy) {
            event.preventDefault();
            return;
          }
          onDragStart(event);
          if (!event.defaultPrevented) setIsDragging(true);
        }}
        onDragEnd={(event) => {
          setIsDragging(false);
          onDragEnd(event);
        }}
        role="group"
        aria-label={task.title}
        onDoubleClick={() => onOpen()}
        className={`transition-opacity group ${isDragging && canWrite && !busy ? 'opacity-50' : ''}`}
      >
        <button
          className="text-left text-sm font-medium break-words"
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {task.title}
        </button>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priority.color} ${priority.bg}`}
          >
            {priority.label}
          </span>
          {task.assignee && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-white ml-auto"
              style={{ backgroundColor: generateColor(task.assignee.email || '') }}
            >
              {getInitials(task.assignee.name || '?')}
            </div>
          )}
        </div>
      </div>
      {dragAdapter && canWrite && (
        <button
          type="button"
          {...dragAdapter.attributes}
          {...(!busy && !dragAdapter.attributes['aria-disabled']
            ? dragAdapter.listeners
            : undefined)}
          ref={dragHandleRef}
          disabled={busy || dragAdapter.attributes['aria-disabled']}
          aria-disabled={busy || dragAdapter.attributes['aria-disabled']}
          aria-label={`Drag ${task.title}`}
          className="mt-2 rounded px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        >
          Drag
        </button>
      )}
      {canWrite && (
        <div className="mt-3">
          <Select
            label={`Move ${task.title}`}
            value={task.columnId}
            disabled={busy}
            options={columns.map((item) => ({ value: item.id, label: item.name }))}
            onValueChange={onMove}
          />
        </div>
      )}
    </div>
  );
}
