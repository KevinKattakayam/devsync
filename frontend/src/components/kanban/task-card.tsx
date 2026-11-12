'use client';

import type { DragEvent } from 'react';
import type { Task } from '@/types';
import { generateColor, getInitials } from '@/lib/utils';
import { Select } from '@/components/ui';

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
  dragging,
  onOpen,
  onDragStart,
  onMove,
}: {
  task: Task;
  columns: { id: string; name: string }[];
  canWrite: boolean;
  busy: boolean;
  dragging: boolean;
  onOpen: (trigger?: HTMLButtonElement) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onMove: (columnId: string) => void;
}) {
  const priority = priorityConfig[task.priority?.toUpperCase()] || priorityConfig.MEDIUM;
  return (
    <div className="rounded-lg bg-card p-3">
      <div
        draggable={canWrite && !busy}
        onDragStart={onDragStart}
        role="group"
        aria-label={task.title}
        onDoubleClick={() => onOpen()}
        className={`transition-opacity group ${dragging ? 'opacity-50' : ''}`}
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
