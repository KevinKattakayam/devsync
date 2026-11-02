import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DashboardPage from '../src/app/(dashboard)/dashboard/page';
import DashboardBoundary from '../src/app/(dashboard)/dashboard/error';
import { loadDashboard } from '../src/lib/dashboard-data';
import { startUndoableDocument } from '../src/lib/undoable-document';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  create: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
}));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'clerk-different-id' } }),
}));
vi.mock('@/lib/api', () => ({
  default: { get: mocks.get, post: mocks.post, patch: mocks.patch },
  workspaceApi: { create: mocks.create },
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error, loading: mocks.loading },
}));
const workspace = { id: 'one', name: 'Engineering', role: 'OWNER', members: [] };
beforeEach(() => {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/auth/me') return { data: { id: 'local-self', name: 'Ada Developer' } };
    if (path === '/workspaces') return { data: [workspace] };
    if (path.endsWith('/documents'))
      return { data: [{ id: 'doc', title: 'Architecture', updatedAt: '2026-11-01T01:00:00Z' }] };
    if (path.endsWith('/boards'))
      return {
        data: [
          {
            id: 'board',
            name: 'Board',
            columns: [
              {
                name: 'To do',
                tasks: [
                  { id: 'mine', title: 'My task', priority: 'LOW', assignee: { id: 'local-self' } },
                  {
                    id: 'other',
                    title: 'Someone else task',
                    priority: 'LOW',
                    assignee: { id: 'clerk-different-id' },
                  },
                ],
              },
            ],
          },
        ],
      };
    return {
      data: [
        {
          id: 'activity',
          message: 'A document was updated',
          createdAt: '2026-11-01T02:00:00Z',
          user: { name: 'Ada Developer' },
        },
      ],
    };
  });
  mocks.post.mockResolvedValue({
    data: { id: 'new-document', title: 'Untitled', updatedAt: '2026-11-01T03:00:00Z' },
  });
  mocks.patch.mockResolvedValue({ data: {} });
  mocks.create.mockResolvedValue({ data: { id: 'created-workspace' } });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('shows real projections and matches assigned tasks to the local principal, not the Clerk ID', async () => {
  render(<DashboardPage />);
  expect(screen.getByRole('status', { name: 'Loading dashboard' })).toBeTruthy();
  await screen.findByRole('link', { name: /Architecture/ });
  expect(screen.getByRole('link', { name: /My task/ }).getAttribute('href')).toBe(
    '/workspace/one/kanban',
  );
  expect(screen.queryByText('Someone else task')).toBeNull();
  expect(screen.getByText('A document was updated')).toBeTruthy();
});
it('offers a retry for a total failure and recovers without turning errors into an empty state', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Unavailable'));
  const user = userEvent.setup();
  render(<DashboardPage />);
  await screen.findByText('Your dashboard could not load');
  expect(screen.queryByText('Make room for your next idea')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('My task');
});
it('keeps successful sections available when one endpoint fails', async () => {
  const original = mocks.get.getMockImplementation();
  mocks.get.mockImplementation((path: string) =>
    path.endsWith('/activities') ? Promise.reject(new Error('Unavailable')) : original?.(path),
  );
  render(<DashboardPage />);
  await screen.findByText('Some work could not load');
  expect(screen.getByText('My task')).toBeTruthy();
  expect(screen.getByText(/Could not load activity in Engineering/)).toBeTruthy();
});
it('explains an actual empty account without inventing sample work', async () => {
  const original = mocks.get.getMockImplementation();
  mocks.get.mockImplementation((path: string) =>
    path === '/workspaces' ? Promise.resolve({ data: [] }) : original?.(path),
  );
  render(<DashboardPage />);
  await screen.findByText('Make room for your next idea');
  expect(screen.queryByText('Architecture')).toBeNull();
  expect(screen.getByRole('button', { name: 'New document' }).hasAttribute('disabled')).toBe(true);
});
it('keeps create-workspace input after a server failure and allows retry', async () => {
  mocks.create.mockRejectedValueOnce(new Error('Unavailable'));
  const user = userEvent.setup();
  render(<DashboardPage />);
  await screen.findByText('My task');
  await user.click(screen.getByRole('button', { name: 'New workspace' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New workspace');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  await screen.findByRole('alert');
  expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(
    'New workspace',
  );
  await user.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
});
it('optimistically shows document creation and wires Undo to archival instead of deletion', async () => {
  const user = userEvent.setup();
  render(<DashboardPage />);
  await screen.findByText('My task');
  await user.click(screen.getByRole('button', { name: 'New document' }));
  await screen.findByRole('link', { name: 'Untitled' });
  const call = mocks.success.mock.calls.find(([label]) => label === 'Document created');
  expect(call).toBeTruthy();
  const action = call?.[1] as { action: { onClick: () => void } };
  await act(async () => action.action.onClick());
  await waitFor(() =>
    expect(mocks.patch).toHaveBeenCalledWith('/documents/new-document', { isArchived: true }),
  );
  expect(screen.queryByRole('link', { name: 'Untitled' })).toBeNull();
  expect(mocks.post.mock.calls[0][2].headers['Idempotency-Key']).toBeTruthy();
});
it('supports undo before creation resolves and preserves content on archive failure', async () => {
  let finish: (document: { id: string; title: string; updatedAt: string }) => void = () => {};
  const create = vi.fn(
    () =>
      new Promise<{ id: string; title: string; updatedAt: string }>((resolve) => {
        finish = resolve;
      }),
  );
  const archive = vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined);
  const observer = { committed: vi.fn(), hidden: vi.fn(), undone: vi.fn(), failed: vi.fn() };
  const operation = startUndoableDocument({ create, archive }, observer);
  const undoing = operation.undo();
  const document = { id: 'new', title: 'Untitled', updatedAt: '2026-11-01T03:00:00Z' };
  finish(document);
  await undoing;
  expect(observer.committed).not.toHaveBeenCalled();
  expect(observer.failed).toHaveBeenCalledWith('undo', document);
  await operation.undo();
  expect(observer.undone).toHaveBeenCalledOnce();
});
it('boundary retries without exposing an internal exception', async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(<DashboardBoundary error={new Error('private diagnostic')} retry={retry} />);
  expect(screen.queryByText('private diagnostic')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});
it('bounds workspace fetch concurrency to three workspace batches', async () => {
  const original = mocks.get.getMockImplementation();
  let active = 0;
  let peak = 0;
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/workspaces')
      return {
        data: Array.from({ length: 8 }, (_, index) => ({ ...workspace, id: `workspace-${index}` })),
      };
    if (path === '/auth/me') return original?.(path);
    active++;
    peak = Math.max(active, peak);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { data: [] };
  });
  const data = await loadDashboard();
  expect(data.workspaces).toHaveLength(8);
  expect(peak).toBeLessThanOrEqual(9);
});
