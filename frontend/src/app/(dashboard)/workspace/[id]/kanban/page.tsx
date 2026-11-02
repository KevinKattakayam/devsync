'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { boardApi, taskApi } from '@/lib/api';
import { Board, Task } from '@/types';
import { getInitials, generateColor } from '@/lib/utils';
import { Plus, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, DrawerContent, Select, Skeleton } from '@/components/ui';
import { useLocalFirstRecord, useLocalFirstYDoc } from '@/lib/local-first-yjs';
import { useAuth } from '@/providers/auth-provider';
import { useCRDTGarbageCollector } from '@/hooks/use-crdt-garbage-collector';
import { SprintAnalyticsModal } from '@/components/sprint-analytics-modal';

const priorityConfig: Record<string, { color: string; bg: string; label: string }> = {
  LOW: { color: 'text-foreground', bg: 'bg-secondary', label: 'Low' },
  MEDIUM: { color: 'text-foreground', bg: 'bg-secondary', label: 'Medium' },
  HIGH: { color: 'text-foreground', bg: 'bg-secondary', label: 'High' },
  URGENT: { color: 'text-foreground', bg: 'bg-secondary', label: 'Urgent' },
};

export default function KanbanPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, user } = useAuth();
  const boardSync = useLocalFirstYDoc(`kanban:${id}`, getToken, user?.id);
  useCRDTGarbageCollector(boardSync.document);
  const localBoards = useLocalFirstRecord<Board[]>(boardSync.document, 'boards');
  const setLocalBoards = localBoards.set;
  const boards = useMemo(() => localBoards.value ?? [], [localBoards.value]);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWrite = boardSync.canWrite;
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    boardApi
      .list(id)
      .then(({ data }) => {
        if (!disposed) setLocalBoards(data);
      })
      .catch(() => {
        if (!disposed) setLoadError(true);
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [id, setLocalBoards, attempt]);

  const persistBoards = useCallback(
    (next: Board[]): void => {
      localBoards.set(next);
    },
    [localBoards],
  );

  const mutateTask = useCallback(
    (taskId: string, mutate: (task: Task) => Task | null): void => {
      persistBoards(
        boards.map((board) => ({
          ...board,
          columns: board.columns.map((column) => ({
            ...column,
            tasks: column.tasks.flatMap((task) => {
              if (task.id !== taskId) return [task];
              const updated = mutate(task);
              return updated ? [updated] : [];
            }),
          })),
        })),
      );
    },
    [boards, persistBoards],
  );

  const retry = () => {
    setLoadError(false);
    setAttempt((value) => value + 1);
  };
  const addTask = async (columnId: string) => {
    if (!canWrite || busy) return;
    if (!newTaskTitle.trim()) return;
    const optimisticId = `local:${crypto.randomUUID()}`;
    const optimistic: Task = {
      id: optimisticId,
      title: newTaskTitle,
      priority: 'MEDIUM',
      position: 0,
      labels: [],
      columnId,
    };
    persistBoards(
      boards.map((board) => ({
        ...board,
        columns: board.columns.map((column) =>
          column.id === columnId ? { ...column, tasks: [optimistic, ...column.tasks] } : column,
        ),
      })),
    );
    setNewTaskTitle('');
    setAddingToColumn(null);
    try {
      const { data } = await taskApi.create(columnId, { title: optimistic.title });
      mutateTask(optimisticId, () => data);
    } catch {
      toast.error('Task creation was not confirmed. Refresh the board before retrying.');
      retry();
    }
  };

  const updateTask = async (taskId: string, data: Partial<Task>) => {
    if (!canWrite || busy) return;
    mutateTask(taskId, (task) => ({ ...task, ...data }));
    try {
      await taskApi.update(taskId, data);
    } catch {
      toast.error('Task update was not confirmed. Refreshing the board.');
      retry();
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!canWrite || busy) return;
    mutateTask(taskId, () => null);
    setShowTaskModal(false);
    setSelectedTask(null);
    try {
      await taskApi.delete(taskId);
    } catch {
      toast.error('Task deletion was not confirmed. Refresh the board before retrying.');
    }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (!canWrite || busy) {
      e.preventDefault();
      return;
    }
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };
  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };
  const moveTask = async (task: Task, columnId: string, undo = false) => {
    if (!canWrite || busy || task.id.startsWith('local:') || task.columnId === columnId) return;
    setBusy(true);
    const moved = { ...task, columnId, position: 0 };
    persistBoards(
      boards.map((board) => ({
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          tasks:
            column.id === columnId
              ? [moved, ...column.tasks.filter((item) => item.id !== task.id)]
              : column.tasks.filter((item) => item.id !== task.id),
        })),
      })),
    );
    try {
      await taskApi.move(task.id, { columnId, position: 0 });
      toast.success(undo ? 'Move undone' : 'Task moved', {
        action: undo
          ? undefined
          : {
              label: 'Undo',
              onClick: () => {
                void taskApi
                  .move(task.id, { columnId: task.columnId, position: task.position })
                  .then(() => {
                    toast.success('Move undone');
                    retry();
                  })
                  .catch(() => toast.error('Undo was not confirmed. Refresh the board.'));
              },
            },
      });
    } catch {
      toast.error('Move was not confirmed. Refreshing the board.');
      retry();
    } finally {
      setBusy(false);
      setDraggedTask(null);
    }
  };
  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedTask) void moveTask(draggedTask, columnId);
  };
  if (loadError)
    return (
      <div role="alert" className="p-8">
        <h1 className="text-xl font-semibold">Board could not load</h1>
        <p className="my-4">Check your connection and workspace access.</p>
        <Button onClick={retry}>Retry board</Button>
      </div>
    );

  if (isLoading && !localBoards.value)
    return (
      <div role="status" aria-label="Loading board" className="space-y-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );

  const board = boards[0];
  if (!board)
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">No board yet</h1>
        <p className="my-4 text-muted-foreground">Ask a workspace owner to set up a board.</p>
        <Button onClick={retry}>Refresh board</Button>
      </div>
    );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="p-4 pb-4 flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{board.name}</h1>
          <p className="text-sm text-muted-foreground">
            {board.columns.reduce((s, c) => s + c.tasks.length, 0)} tasks ·{' '}
            {canWrite ? 'Drag cards, or use Move for keyboard access.' : 'Read only'}
          </p>
        </div>
        <button
          onClick={() => setShowAnalytics(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass border-white/10 hover:border-primary/40 text-xs font-semibold text-foreground hover:bg-white/[0.04] transition-all shadow-sm"
        >
          <BarChart3 className="w-4 h-4 text-foreground" />
          <span>Sprint Analytics</span>
        </button>
      </div>
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {board.columns.map((column) => (
            <div
              key={column.id}
              className={`w-72 flex flex-col rounded-xl ${dragOverColumn === column.id ? 'bg-primary/5 ring-2 ring-primary/30' : 'bg-muted/30'}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{column.name}</h2>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {column.tasks.length}
                  </span>
                </div>
                <button
                  disabled={!canWrite || busy}
                  aria-label={`Add task to ${column.name}`}
                  onClick={() => {
                    setAddingToColumn(column.id);
                    setNewTaskTitle('');
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted text-muted-foreground"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {addingToColumn === column.id && (
                  <div className="glass-card p-3 animate-scale-in">
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm focus:border-primary outline-none"
                      placeholder="Task title..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addTask(column.id);
                        if (e.key === 'Escape') setAddingToColumn(null);
                      }}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => addTask(column.id)}
                        className="px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-medium"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingToColumn(null)}
                        className="px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {column.tasks.map((task) => {
                  const priority =
                    priorityConfig[task.priority?.toUpperCase()] || priorityConfig.MEDIUM;
                  return (
                    <div key={task.id} className="rounded-lg bg-card p-3">
                      <div
                        draggable={canWrite && !busy}
                        onDragStart={(e) => handleDragStart(e, task)}
                        role="group"
                        aria-label={task.title}
                        onDoubleClick={() => {
                          setSelectedTask(task);
                          setShowTaskModal(true);
                        }}
                        className={`transition-opacity group ${draggedTask?.id === task.id ? 'opacity-50' : ''}`}
                      >
                        <button
                          className="text-left text-sm font-medium break-words"
                          onClick={() => {
                            setSelectedTask(task);
                            setShowTaskModal(true);
                          }}
                        >
                          {task.title}
                        </button>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {task.description}
                          </p>
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
                            options={board.columns.map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                            onValueChange={(columnId) => {
                              void moveTask(task, columnId);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Drawer open={showTaskModal && !!selectedTask} onOpenChange={setShowTaskModal}>
        <DrawerContent
          title="Task details"
          description="Changes save when you leave a field. Workspace permissions apply."
        >
          {selectedTask && (
            <fieldset disabled={!canWrite || busy} className="min-w-0">
              <label className="block text-sm">
                Title
                <input
                  aria-label="Task title"
                  defaultValue={selectedTask.title}
                  className="ui-input my-3"
                  onBlur={(e) => {
                    if (e.target.value !== selectedTask.title)
                      void updateTask(selectedTask.id, { title: e.target.value });
                  }}
                />
              </label>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Description
                  </label>
                  <textarea
                    aria-label="Task description"
                    defaultValue={selectedTask.description || ''}
                    className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm resize-none outline-none"
                    rows={3}
                    placeholder="Add description..."
                    onBlur={(e) => updateTask(selectedTask.id, { description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Priority
                    </label>
                    <select
                      aria-label="Task priority"
                      defaultValue={selectedTask.priority}
                      onChange={(e) =>
                        updateTask(selectedTask.id, {
                          priority: e.target.value as Task['priority'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Due Date
                    </label>
                    <input
                      aria-label="Task due date"
                      type="date"
                      defaultValue={
                        selectedTask.dueDate
                          ? new Date(selectedTask.dueDate).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        updateTask(selectedTask.id, {
                          dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="pt-3 border-t border-border flex justify-end">
                  <button
                    onClick={() => deleteTask(selectedTask.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </fieldset>
          )}
        </DrawerContent>
      </Drawer>

      {showAnalytics && (
        <SprintAnalyticsModal board={board} onClose={() => setShowAnalytics(false)} />
      )}
    </div>
  );
}
