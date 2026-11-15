'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { boardApi, taskApi } from '@/lib/api';
import { Board, Task } from '@/types';
import { findMoveTarget } from '@/components/kanban/move-guard';
import { Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Drawer, DrawerContent, Skeleton } from '@/components/ui';
import { useLocalFirstRecord, useLocalFirstYDoc } from '@/lib/local-first-yjs';
import { useAuth } from '@/providers/auth-provider';
import { useCRDTGarbageCollector } from '@/hooks/use-crdt-garbage-collector';
import { SprintAnalyticsModal } from '@/components/sprint-analytics-modal';
import { TaskCsvControls } from '@/components/workspace/portability-controls';
import { loadWorkspaceAccess } from '@/lib/workspace-access';
import { VirtualizedKanbanBoard } from '@/components/kanban/virtualized-board';

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
  const [workspaceAccess, setWorkspaceAccess] = useState<{
    workspaceId: string;
    role: string;
  } | null>(null);
  const [accessErrorWorkspace, setAccessErrorWorkspace] = useState<string | null>(null);
  const workspaceRole = workspaceAccess?.workspaceId === id ? workspaceAccess.role : '';
  const accessState = workspaceRole
    ? 'ready'
    : accessErrorWorkspace === id
      ? 'unavailable'
      : 'loading';
  const [busy, setBusy] = useState(false);
  const canWrite = boardSync.canWrite;
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const taskTrigger = useRef<HTMLButtonElement | null>(null);
  const boardHeading = useRef<HTMLHeadingElement | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);

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

  useEffect(() => {
    let disposed = false;
    void loadWorkspaceAccess(id)
      .then(({ role }) => {
        if (!disposed) {
          setWorkspaceAccess({ workspaceId: id, role });
        }
      })
      .catch(() => {
        if (!disposed) {
          setAccessErrorWorkspace(id);
        }
      });
    return () => {
      disposed = true;
    };
  }, [id]);

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

  const moveTask = async (taskId: string, columnId: string, undo = false) => {
    const task = findMoveTarget(boards, taskId, columnId, canWrite, busy);
    if (!task) return;
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
    }
  };
  if (localBoards.error)
    return (
      <div role="alert" className="p-8">
        <h1 className="text-xl font-semibold">Local board data needs recovery</h1>
        <p className="my-4">
          Stored local data could not be read and has been preserved. Avoid clearing browser storage
          until you have recovered any local drafts.
        </p>
      </div>
    );
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
          <h1 ref={boardHeading} tabIndex={-1} className="text-xl font-bold">
            {board.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {board.columns.reduce((s, c) => s + c.tasks.length, 0)} tasks ·{' '}
            {canWrite ? 'Drag cards, or use Move for keyboard access.' : 'Read only'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {workspaceRole && (
            <TaskCsvControls
              workspaceId={id}
              canEdit={workspaceRole === 'OWNER' || workspaceRole === 'EDITOR'}
            />
          )}
          {accessState === 'loading' && (
            <p role="status" className="text-xs text-muted-foreground">
              Checking current workspace permissions…
            </p>
          )}
          {accessState === 'unavailable' && (
            <p role="alert" className="text-xs text-destructive">
              Current workspace access could not be verified. Task import/export controls are
              hidden.
            </p>
          )}
          <button
            onClick={() => setShowAnalytics(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass border-white/10 hover:border-primary/40 text-xs font-semibold text-foreground hover:bg-white/[0.04] transition-all shadow-sm"
          >
            <BarChart3 className="w-4 h-4 text-foreground" />
            <span>Sprint Analytics</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <VirtualizedKanbanBoard
          board={board}
          canWrite={canWrite}
          busy={busy}
          addingToColumn={addingToColumn}
          newTaskTitle={newTaskTitle}
          onNewTaskTitleChange={setNewTaskTitle}
          onStartAdd={(columnId) => {
            setAddingToColumn(columnId);
            setNewTaskTitle('');
          }}
          onAdd={(columnId) => void addTask(columnId)}
          onCancelAdd={() => setAddingToColumn(null)}
          onOpen={(task, trigger) => {
            if (trigger) taskTrigger.current = trigger;
            setSelectedTask(task);
            setShowTaskModal(true);
          }}
          onMove={(taskId, columnId) => void moveTask(taskId, columnId)}
        />
      </div>
      <Drawer open={showTaskModal && !!selectedTask} onOpenChange={setShowTaskModal}>
        <DrawerContent
          title="Task details"
          description="Changes save when you leave a field. Workspace permissions apply."
          className="w-[min(30rem,calc(100vw-2rem))]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              if (taskTrigger.current?.isConnected) taskTrigger.current.focus();
              else boardHeading.current?.focus();
            });
          }}
        >
          {selectedTask && (
            <fieldset disabled={!canWrite || busy} className="min-w-0">
              <label htmlFor="task-title" className="block text-sm font-medium">
                Title
                <input
                  id="task-title"
                  aria-label="Task title"
                  defaultValue={selectedTask.title}
                  className="ui-input mt-2"
                  onBlur={(e) => {
                    if (e.target.value !== selectedTask.title)
                      void updateTask(selectedTask.id, { title: e.target.value });
                  }}
                />
              </label>
              <div className="mt-5 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="task-description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="task-description"
                    aria-label="Task description"
                    defaultValue={selectedTask.description || ''}
                    className="ui-input min-h-28 resize-y"
                    rows={4}
                    placeholder="Add description..."
                    onBlur={(e) => updateTask(selectedTask.id, { description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <label htmlFor="task-priority" className="text-sm font-medium">
                      Priority
                    </label>
                    <select
                      id="task-priority"
                      aria-label="Task priority"
                      defaultValue={selectedTask.priority}
                      onChange={(e) =>
                        updateTask(selectedTask.id, {
                          priority: e.target.value as Task['priority'],
                        })
                      }
                      className="ui-input"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <label htmlFor="task-due-date" className="text-sm font-medium">
                      Due date
                    </label>
                    <input
                      id="task-due-date"
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
                      className="ui-input"
                    />
                  </div>
                </div>
                <div className="flex justify-end border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    size="compact"
                    onClick={() => deleteTask(selectedTask.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete
                  </Button>
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
