'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Button, Drawer, DrawerContent, Select } from '@/components/ui';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

type FixtureTask = { id: string; title: string; column: 'todo' | 'done' };

function DragHandle({ task, disabled }: { task: FixtureTask; disabled: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Drag ${task.title}`}
      disabled={disabled}
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      Drag
    </button>
  );
}

function Destination() {
  const { setNodeRef } = useDroppable({ id: 'done' });
  return (
    <div ref={setNodeRef} data-drop="done" style={{ border: '1px solid', padding: 20 }}>
      Done destination
    </div>
  );
}

const initialTasks: FixtureTask[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `fixture-task-${index}`,
  title: `Task ${index + 1}`,
  column: 'todo',
}));

export function VirtualizedKanbanControlsProof() {
  const [tasks, setTasks] = useState(initialTasks);
  const [authorized, setAuthorized] = useState(true);
  const [canWrite, setCanWrite] = useState(true);
  const [activeId, setActiveId] = useState('fixture-task-0');
  const [lastMove, setLastMove] = useState('none');
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragResult, setDragResult] = useState('idle');
  const [rejectNext, setRejectNext] = useState(false);
  const [dragSession, setDragSession] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor));
  const list = useRef<VirtuosoHandle>(null);
  const host = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const taskTriggers = useRef(new Map<string, HTMLButtonElement>());
  const focusedTaskId = useRef<string | null>(null);
  const scrollInProgress = useRef(false);
  const scrollReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptedDrag = useRef(false);

  const visibleTasks = useMemo(
    () => (authorized ? tasks.filter((task) => task.column === 'todo') : []),
    [authorized, tasks],
  );
  const activeIndex = visibleTasks.findIndex((task) => task.id === activeId);
  const activeIsRendered =
    activeIndex >= visibleRange.startIndex && activeIndex <= visibleRange.endIndex;
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;

  useEffect(() => {
    const onFixtureChange = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === 'viewer') setCanWrite(false);
      else if (action === 'revoke') {
        setAuthorized(false);
        setActiveId('');
      } else if (action === 'delete' && dragId) {
        if (activeId === dragId)
          setActiveId(visibleTasks.find((task) => task.id !== dragId)?.id ?? '');
        setTasks((current) => current.filter((task) => task.id !== dragId));
      } else return;
      interruptedDrag.current = true;
      setDragId(null);
      setDragSession((value) => value + 1);
      setDragResult(action);
      requestAnimationFrame(() => heading.current?.focus());
    };
    window.addEventListener('fixture-change', onFixtureChange);
    return () => window.removeEventListener('fixture-change', onFixtureChange);
  }, [activeId, dragId, visibleTasks]);

  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const trigger = selectedId ? taskTriggers.current.get(selectedId) : null;
      if (authorized && trigger?.isConnected) trigger.focus();
      else heading.current?.focus();
    });
  }, [authorized, selectedId]);

  const onRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      setVisibleRange(range);
      const focusedId = focusedTaskId.current;
      if (!scrollInProgress.current || !focusedId) return;
      const index = visibleTasks.findIndex((task) => task.id === focusedId);
      // A row removed by a move/delete is not an offscreen focused row. The move handler
      // chooses its successor; do not resurrect the removed ID during the range callback.
      if (index < 0) return;
      if (index >= range.startIndex && index <= range.endIndex) return;
      // The focused row is about to unmount. Move focus deliberately to the persistent host.
      requestAnimationFrame(() => {
        if (
          !taskTriggers.current.get(focusedId)?.isConnected &&
          document.activeElement === document.body
        ) {
          setActiveId(focusedId);
          host.current?.focus();
        }
      });
    },
    [visibleTasks],
  );

  const attachHost = useCallback((element: HTMLElement | Window | null) => {
    if (!(element instanceof HTMLElement)) {
      host.current = null;
      return;
    }
    host.current = element;
    element.addEventListener('scroll', () => {
      scrollInProgress.current = true;
      if (scrollReset.current) clearTimeout(scrollReset.current);
      scrollReset.current = setTimeout(() => {
        scrollInProgress.current = false;
      }, 120);
    });
  }, []);

  function navigate(index: number) {
    if (visibleTasks.length === 0) return;
    const nextIndex = Math.min(visibleTasks.length - 1, Math.max(0, index));
    const next = visibleTasks[nextIndex];
    if (!next) return;
    setActiveId(next.id);
    list.current?.scrollToIndex({ index: nextIndex, align: 'center' });
  }

  function onHostKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== host.current) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigate(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigate(activeIndex - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      taskTriggers.current.get(activeId)?.focus();
    }
  }

  function moveTask(task: FixtureTask, column: FixtureTask['column'], fromCardControl = false) {
    if (!canWrite || task.column === column) return;
    setLastMove(`${task.id}:${column}:${fromCardControl}`);
    focusedTaskId.current = task.id;
    const taskIndex = visibleTasks.findIndex((item) => item.id === task.id);
    const nextActiveId =
      taskIndex < 0
        ? ''
        : (visibleTasks[taskIndex + 1]?.id ?? visibleTasks[taskIndex - 1]?.id ?? '');
    const leavesCurrentList = task.column === 'todo' && column !== 'todo';
    if (fromCardControl || (leavesCurrentList && activeId === task.id)) {
      setActiveId(nextActiveId);
    }
    if (fromCardControl && leavesCurrentList) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!taskTriggers.current.get(task.id)?.isConnected) host.current?.focus();
        });
      });
    }
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, column } : item)),
    );
  }

  function deleteSelectedTask() {
    if (!canWrite || !selectedId) return;
    const taskIndex = visibleTasks.findIndex((task) => task.id === selectedId);
    if (activeId === selectedId) {
      setActiveId(
        taskIndex < 0
          ? ''
          : (visibleTasks[taskIndex + 1]?.id ?? visibleTasks[taskIndex - 1]?.id ?? ''),
      );
    }
    setTasks((current) => current.filter((task) => task.id !== selectedId));
  }

  return (
    <main
      className="mx-auto max-w-3xl p-4"
      data-active-task={activeId}
      data-last-move={lastMove}
      data-visible-task-count={visibleTasks.length}
      data-done-task-count={tasks.filter((task) => task.column === 'done').length}
    >
      <h1 ref={heading} tabIndex={-1} className="mb-3 text-xl font-semibold outline-none">
        Kanban controls integration proof
      </h1>
      <p id="board-help" className="mb-3 text-sm">
        Use Up and Down on the task list to choose a task. Press Enter to focus its title. Tab
        reaches task controls; the Move control uses the existing Radix menu.
      </p>
      <DndContext
        key={dragSession}
        sensors={sensors}
        onDragStart={({ active }) => {
          interruptedDrag.current = false;
          setDragId(String(active.id));
          setDragResult('dragging');
        }}
        onDragCancel={() => {
          if (interruptedDrag.current) return;
          setDragId(null);
          setDragResult('cancelled');
          host.current?.focus();
        }}
        onDragEnd={({ active, over }) => {
          if (interruptedDrag.current) return;
          const task = tasks.find((item) => item.id === String(active.id));
          setDragId(null);
          if (!task || !authorized || !canWrite || over?.id !== 'done') {
            setDragResult('denied');
            host.current?.focus();
            return;
          }
          if (rejectNext) {
            setRejectNext(false);
            moveTask(task, 'done');
            setDragResult('pending');
            setTimeout(() => {
              setTasks((current) =>
                current.map((item) =>
                  item.id === task.id ? { ...item, column: task.column } : item,
                ),
              );
              setDragResult('rejected-rolled-back');
            }, 500);
            host.current?.focus();
            return;
          }
          moveTask(task, 'done');
          setDragResult('moved');
          host.current?.focus();
        }}
      >
        <Virtuoso
          ref={list}
          scrollerRef={attachHost}
          role="grid"
          tabIndex={0}
          aria-label="Kanban tasks"
          aria-describedby="board-help"
          aria-rowcount={visibleTasks.length}
          aria-activedescendant={activeIsRendered ? `kanban-row-${activeId}` : undefined}
          onKeyDown={onHostKeyDown}
          style={{ height: 420, width: '100%', border: '1px solid #9ca3af', borderRadius: 8 }}
          totalCount={visibleTasks.length}
          computeItemKey={(index) => visibleTasks[index]?.id ?? `empty-${index}`}
          rangeChanged={onRangeChanged}
          itemContent={(index) => {
            const task = visibleTasks[index];
            if (!task) return null;
            return (
              <div
                id={`kanban-row-${task.id}`}
                role="row"
                aria-rowindex={index + 1}
                data-task-id={task.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 p-3"
              >
                <div role="gridcell" className="min-w-0 flex-1">
                  <button
                    ref={(element) => {
                      if (element) taskTriggers.current.set(task.id, element);
                      else taskTriggers.current.delete(task.id);
                    }}
                    type="button"
                    aria-label={task.title}
                    className={`min-h-10 max-w-full break-words text-left underline-offset-4 focus-visible:outline focus-visible:outline-2 ${
                      activeId === task.id ? 'font-semibold underline' : ''
                    }`}
                    onFocus={() => {
                      focusedTaskId.current = task.id;
                      setActiveId(task.id);
                    }}
                    onClick={() => {
                      focusedTaskId.current = task.id;
                      setSelectedId(task.id);
                      setDrawerOpen(true);
                    }}
                  >
                    {task.title}
                  </button>
                </div>
                {canWrite && (
                  <div role="gridcell" className="w-40">
                    <DragHandle task={task} disabled={!authorized || !canWrite} />
                    <Select
                      label={`Move ${task.title}`}
                      value={task.column}
                      options={[
                        { value: 'todo', label: 'To do' },
                        { value: 'done', label: 'Done' },
                      ]}
                      onValueChange={(value) =>
                        moveTask(task, value as FixtureTask['column'], true)
                      }
                    />
                  </div>
                )}
              </div>
            );
          }}
        />
        <Destination />
        <DragOverlay dropAnimation={null}>
          {dragId ? <div data-overlay="true">Dragging {dragId}</div> : null}
        </DragOverlay>
      </DndContext>
      <p data-drag-result={dragResult}>{dragResult}</p>
      <Button tabIndex={-1} onClick={() => setRejectNext(true)}>
        Reject next fixture move
      </Button>
      <Button
        tabIndex={-1}
        onClick={() => {
          if (dragId) {
            if (activeId === dragId)
              setActiveId(visibleTasks.find((task) => task.id !== dragId)?.id ?? '');
            setTasks((current) => current.filter((task) => task.id !== dragId));
          }
          setDragId(null);
          setDragResult('deleted');
          setDragSession((value) => value + 1);
          host.current?.focus();
        }}
      >
        Delete dragged fixture task
      </Button>
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {authorized
          ? activeIndex >= 0
            ? `${visibleTasks[activeIndex]?.title}, task ${activeIndex + 1} of ${visibleTasks.length}${activeIsRendered ? '' : ', outside the rendered window; use an arrow key to return'}`
            : 'No active task'
          : 'Workspace access revoked. Task details are unavailable.'}
      </p>
      <Button variant="secondary" aria-label="After task list">
        After task list
      </Button>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          tabIndex={-1}
          variant="secondary"
          onClick={() => {
            setCanWrite((value) => !value);
            setDragId(null);
            setDragSession((value) => value + 1);
          }}
        >
          {canWrite ? 'Switch to viewer' : 'Switch to editor'}
        </Button>
        <Button
          tabIndex={-1}
          variant="secondary"
          onClick={() => {
            setAuthorized(false);
            setDragId(null);
            setDragSession((value) => value + 1);
            setDrawerOpen(false);
            setSelectedId(null);
            setActiveId('');
          }}
        >
          Revoke fixture access
        </Button>
      </div>
      <p className="mt-2 text-xs">Fixture only: task moves and deletion are in-memory.</p>

      <Drawer open={drawerOpen && selectedTask !== null} onOpenChange={setDrawerOpen}>
        <DrawerContent
          title="Task details"
          description="Fixture task details. Workspace permissions apply."
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          {selectedTask && authorized && (
            <div className="space-y-3">
              <p>{selectedTask.title}</p>
              <Button
                variant="secondary"
                onClick={() => moveTask(selectedTask, 'done')}
                disabled={!canWrite}
              >
                Move task out of this list
              </Button>
              <Button variant="destructive" onClick={deleteSelectedTask} disabled={!canWrite}>
                Delete fixture task
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAuthorized(false);
                  setDragId(null);
                  setDragSession((value) => value + 1);
                  setDrawerOpen(false);
                  setSelectedId(null);
                  setActiveId('');
                }}
              >
                Revoke this task access
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </main>
  );
}
