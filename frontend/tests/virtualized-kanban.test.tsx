import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { VirtualizedKanbanBoard } from '../src/components/kanban/virtualized-board';
import type { Board, Task } from '../src/types';

beforeEach(() => {
  animationFrames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  animationFrames = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function task(id: string, columnId: string, position = 0): Task {
  return { id, title: `Task ${id}`, columnId, position, priority: 'MEDIUM', labels: [] };
}

function board(count = 4): Board {
  return {
    id: 'board',
    name: 'Virtualized board',
    columns: [
      {
        id: 'todo',
        name: 'To do',
        position: 0,
        tasks: Array.from({ length: count }, (_, index) => task(`task-${index}`, 'todo', index)),
      },
      { id: 'done', name: 'Done', position: 1, tasks: [] },
    ],
  };
}

let animationFrames: FrameRequestCallback[] = [];
async function flushAnimationFrames() {
  await act(async () => {
    let frameCount = 0;
    while (animationFrames.length && frameCount < 30) {
      const frame = animationFrames.shift();
      frame?.(0);
      frameCount++;
    }
    expect(animationFrames).toHaveLength(0);
  });
}

function renderBoard(value: Board, canWrite = true, onMove = vi.fn()) {
  return render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 72 }}>
      <VirtualizedKanbanBoard
        board={value}
        canWrite={canWrite}
        busy={false}
        addingToColumn={null}
        newTaskTitle=""
        onNewTaskTitleChange={vi.fn()}
        onStartAdd={vi.fn()}
        onAdd={vi.fn()}
        onCancelAdd={vi.fn()}
        onOpen={vi.fn()}
        onMove={onMove}
      />
    </VirtuosoMockContext.Provider>,
  );
}

it('renders both production columns and bounds a thousand task rows', async () => {
  renderBoard(board(1000));
  expect(screen.getByRole('region', { name: 'To do' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy();
  await waitFor(() =>
    expect(document.querySelectorAll('[data-task-row]').length).toBeGreaterThan(0),
  );
  expect(document.querySelectorAll('[data-task-row]').length).toBeLessThan(30);
});

it('preserves the real task title, keyboard Move control and drawer trigger for viewers', async () => {
  renderBoard(board(2), false);
  expect(await screen.findByRole('button', { name: 'Task task-0' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Move Task task-0' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Drag Task task-0' })).toBeNull();
});

it('keeps a named drag handle and keyboard Move control available to writers', async () => {
  renderBoard(board(2));
  expect(await screen.findByRole('button', { name: 'Drag Task task-0' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Move Task task-0' })).toBeTruthy();
  expect(
    screen.getByText(/Press Space to pick up a task, use the arrow keys to choose a column/),
  ).toBeTruthy();
});

it('returns focus from a virtualized row to the stable board host and navigates back to a task', async () => {
  const user = userEvent.setup();
  const value = board(1000);
  value.columns[1].tasks.push(task('done-0', 'done'));
  renderBoard(value);
  const host = screen.getByRole('region', { name: 'Kanban task board' });
  host.focus();
  await user.keyboard('{ArrowDown}');
  await flushAnimationFrames();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Task task-0' })),
  );
  expect(host.getAttribute('aria-describedby')).toBe('kanban-keyboard-navigation');
  host.focus();
  await user.keyboard('{ArrowRight}');
  await flushAnimationFrames();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Task done-0' })),
  );
});

it('uses the current task and permission state when keyboard drag ends', async () => {
  const user = userEvent.setup();
  const onMove = vi.fn();
  const initial = board(2);
  const view = renderBoard(initial, true, onMove);
  const drag = await screen.findByRole('button', { name: 'Drag Task task-0' });
  const columns = [
    screen.getByRole('region', { name: 'To do' }),
    screen.getByRole('region', { name: 'Done' }),
  ];
  columns.forEach((column, index) => {
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(index * 340, 0, 300, 600),
    );
  });
  const draggable = screen.getByRole('group', { name: 'Task task-0' });
  vi.spyOn(draggable, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 80, 250, 72));
  drag.focus();
  await user.keyboard(' ');
  expect(document.querySelector('p[role="status"]')?.textContent).toContain(
    'Picked up Task task-0',
  );

  view.rerender(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 72 }}>
      <VirtualizedKanbanBoard
        board={initial}
        canWrite={false}
        busy={false}
        addingToColumn={null}
        newTaskTitle=""
        onNewTaskTitleChange={vi.fn()}
        onStartAdd={vi.fn()}
        onAdd={vi.fn()}
        onCancelAdd={vi.fn()}
        onOpen={vi.fn()}
        onMove={onMove}
      />
    </VirtuosoMockContext.Provider>,
  );

  await act(async () => {
    await user.keyboard('{ArrowRight}{Space}');
  });
  expect(onMove).not.toHaveBeenCalled();
});

it('cancels an active drag after its task is deleted without issuing a move', async () => {
  const user = userEvent.setup();
  const onMove = vi.fn();
  const initial = board(2);
  const view = renderBoard(initial, true, onMove);
  const drag = await screen.findByRole('button', { name: 'Drag Task task-0' });
  drag.focus();
  await user.keyboard(' ');
  expect(screen.getByText('Picked up Task task-0. Choose a destination column.')).toBeTruthy();
  const updated: Board = {
    ...initial,
    columns: initial.columns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((item) => item.id !== 'task-0'),
    })),
  };
  view.rerender(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 72 }}>
      <VirtualizedKanbanBoard
        board={updated}
        canWrite
        busy={false}
        addingToColumn={null}
        newTaskTitle=""
        onNewTaskTitleChange={vi.fn()}
        onStartAdd={vi.fn()}
        onAdd={vi.fn()}
        onCancelAdd={vi.fn()}
        onOpen={vi.fn()}
        onMove={onMove}
      />
    </VirtuosoMockContext.Provider>,
  );
  await user.keyboard('{Escape}');
  expect(onMove).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Drag Task task-0' })).toBeNull();
  expect(screen.getAllByText('Task move cancelled.')).toHaveLength(2);
});

it('clears drag cancellation state and leaves the Radix Move control usable', async () => {
  const user = userEvent.setup();
  const onMove = vi.fn();
  renderBoard(board(2), true, onMove);
  const drag = await screen.findByRole('button', { name: 'Drag Task task-0' });
  drag.focus();
  await user.keyboard(' ');
  await user.keyboard('{Escape}');
  expect(onMove).not.toHaveBeenCalled();
  const move = screen.getByRole('combobox', { name: 'Move Task task-0' });
  move.focus();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('option', { name: 'Done' });
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onMove).toHaveBeenCalledWith('task-0', 'done');
  await flushAnimationFrames();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Task task-0' })),
  );
});
