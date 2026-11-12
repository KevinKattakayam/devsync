import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import KanbanPage from '../src/app/(dashboard)/workspace/[id]/kanban/page';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  move: vi.fn(),
  canWrite: true,
  setBoards: null as null | ((value: unknown) => void),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'workspace' }) }));
vi.mock('@/lib/api', () => ({ boardApi: { list: mocks.list }, taskApi: { move: mocks.move } }));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ getToken: vi.fn(), user: { id: 'user' } }),
}));
vi.mock('@/hooks/use-crdt-garbage-collector', () => ({ useCRDTGarbageCollector: vi.fn() }));
vi.mock('@/lib/workspace-access', () => ({
  loadWorkspaceAccess: vi.fn().mockResolvedValue({ role: 'OWNER' }),
}));
vi.mock('@/components/workspace/portability-controls', () => ({ TaskCsvControls: () => null }));
vi.mock('@/components/sprint-analytics-modal', () => ({ SprintAnalyticsModal: () => null }));
vi.mock('@/lib/local-first-yjs', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useLocalFirstYDoc: () => ({ document: {}, canWrite: mocks.canWrite }),
    useLocalFirstRecord: () => {
      const [value, set] = useState<unknown>(null);
      useEffect(() => {
        mocks.setBoards = set;
        return () => {
          mocks.setBoards = null;
        };
      }, [set]);
      return { value, set, error: null };
    },
  };
});

const boards = [
  {
    id: 'board',
    name: 'Board',
    columns: [
      {
        id: 'a',
        name: 'Todo',
        tasks: [
          { id: 't', title: 'Task', columnId: 'a', position: 0, priority: 'MEDIUM', labels: [] },
        ],
      },
      { id: 'b', name: 'Done', tasks: [] },
    ],
  },
];
const dropTask = (column: Element) =>
  fireEvent.drop(column, { dataTransfer: { getData: () => 't' } });
beforeEach(() => {
  mocks.canWrite = true;
  mocks.list.mockReset();
  mocks.move.mockReset();
  mocks.list.mockResolvedValue({ data: boards });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows a load error if a rejected move is followed by a failed refetch', async () => {
  mocks.move.mockRejectedValue(new Error('rejected'));
  mocks.list.mockResolvedValueOnce({ data: boards }).mockRejectedValueOnce(new Error('offline'));
  render(<KanbanPage />);
  const task = await screen.findByRole('group', { name: 'Task' });
  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  dropTask(screen.getByRole('heading', { name: 'Done' }).closest('[class*="w-72"]')!);
  await waitFor(() => expect(mocks.move).toHaveBeenCalledWith('t', { columnId: 'b', position: 0 }));
  expect((await screen.findByRole('alert')).textContent).toContain('Board could not load');
});

it('does not send a move if write permission is revoked after drag starts', async () => {
  const view = render(<KanbanPage />);
  const task = await screen.findByRole('group', { name: 'Task' });
  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  mocks.canWrite = false;
  view.rerender(<KanbanPage />);
  dropTask(screen.getByRole('heading', { name: 'Done' }).closest('[class*="w-72"]')!);
  expect(mocks.move).not.toHaveBeenCalled();
  await waitFor(() => expect(task.className).not.toContain('opacity-50'));
});

it('does not move a task deleted from the board after drag starts', async () => {
  render(<KanbanPage />);
  const task = await screen.findByRole('group', { name: 'Task' });
  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  act(() =>
    mocks.setBoards?.([
      { ...boards[0], columns: boards[0].columns.map((column) => ({ ...column, tasks: [] })) },
    ]),
  );
  dropTask(screen.getByRole('heading', { name: 'Done' }).closest('[class*="w-72"]')!);
  expect(mocks.move).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Task' })).toBeNull());
});

it('clears native drag state after Escape cancellation and allows a later drop', async () => {
  render(<KanbanPage />);
  const task = await screen.findByRole('group', { name: 'Task' });
  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  expect(task.className).toContain('opacity-50');
  fireEvent.dragEnd(task);
  expect(task.className).not.toContain('opacity-50');
  expect(mocks.move).not.toHaveBeenCalled();

  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  dropTask(screen.getByRole('heading', { name: 'Done' }).closest('[class*="w-72"]')!);
  fireEvent.dragEnd(task);
  await waitFor(() => expect(mocks.move).toHaveBeenCalledWith('t', { columnId: 'b', position: 0 }));
  await waitFor(() =>
    expect(screen.getByRole('group', { name: 'Task' }).className).not.toContain('opacity-50'),
  );
});

it('clears native drag state after an invalid same-column drop', async () => {
  render(<KanbanPage />);
  const task = await screen.findByRole('group', { name: 'Task' });
  fireEvent.dragStart(task, { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
  dropTask(screen.getByRole('heading', { name: 'Todo' }).closest('[class*="w-72"]')!);
  fireEvent.dragEnd(task);
  expect(mocks.move).not.toHaveBeenCalled();
  expect(task.className).not.toContain('opacity-50');
});

it('restores focus to the task trigger after closing the drawer', async () => {
  const user = userEvent.setup();
  render(<KanbanPage />);
  const trigger = await screen.findByRole('button', { name: 'Task' });
  await user.click(trigger);
  expect(await screen.findByRole('dialog', { name: 'Task details' })).toBeTruthy();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
