import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), boards: vi.fn(), repos: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: mock.get, post: mock.post },
  boardApi: { list: mock.boards },
  githubRepositoryApi: { list: mock.repos },
}));
vi.mock('@/lib/decision-receipts', () => ({ decisionApi: { path: () => '/decisions' } }));
import { ExecutionTimeline } from '@/components/decisions/execution-timeline';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('labels signed webhook evidence and only offers PR linking to owners', async () => {
  mock.get.mockResolvedValue({
    data: [
      {
        id: '1',
        kind: 'linked_pull_request',
        evidence: 'Reference',
        occurredAt: '2026-11-08T10:00:00Z',
        recordedAt: '2026-11-08T10:01:00Z',
        createdBy: 'owner',
        taskTitle: null,
        pullState: 'merged',
        pullProviderAt: '2026-11-08T10:00:00Z',
        pullObservedAt: '2026-11-08T10:01:00Z',
        githubEvidence: [
          {
            kind: 'check_run',
            subject: '99',
            state: 'completed',
            conclusion: 'success',
            providerAt: '2026-11-08T10:02:00Z',
            observedAt: '2026-11-08T10:03:00Z',
            headSha: 'abc',
          },
        ],
      },
    ],
  });
  render(<ExecutionTimeline workspaceId="w" receiptId="r" canWrite owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load execution timeline' }));
  expect(await screen.findByText(/Signed webhook record: PR merged/)).toBeTruthy();
  expect(screen.getByText(/check_run completed success · ID 99/)).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Linked pull request' })).toBeTruthy();
  expect(screen.queryByText(/deployment verified/i)).toBeNull();
});
it('does not offer PR linking to editors', async () => {
  mock.get.mockResolvedValue({ data: [] });
  render(<ExecutionTimeline workspaceId="w" receiptId="r" canWrite owner={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load execution timeline' }));
  await screen.findByRole('button', { name: 'Record evidence' });
  expect(screen.queryByRole('option', { name: 'Linked pull request' })).toBeNull();
});
it('records task evidence and clears the form on success', async () => {
  mock.get.mockResolvedValue({ data: [] });
  mock.post.mockResolvedValue({ data: { id: 'event' } });
  mock.boards.mockResolvedValue({
    data: [{ columns: [{ tasks: [{ id: 'task-1', title: 'Delivery task' }] }] }],
  });
  render(<ExecutionTimeline workspaceId="w" receiptId="r" canWrite owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load execution timeline' }));
  await screen.findByRole('button', { name: 'Record evidence' });
  fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'linked_task' } });
  await screen.findByRole('option', { name: 'Delivery task' });
  fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'task-1' } });
  fireEvent.change(screen.getByLabelText('Evidence description'), {
    target: { value: 'Tracking task' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record evidence' }));
  await vi.waitFor(() =>
    expect(mock.post).toHaveBeenCalledWith(
      '/decisions/r/timeline',
      expect.objectContaining({
        kind: 'linked_task',
        taskId: 'task-1',
        evidence: 'Tracking task',
        occurredAt: expect.any(String),
      }),
    ),
  );
  await vi.waitFor(() =>
    expect((screen.getByLabelText('Evidence description') as HTMLInputElement).value).toBe(''),
  );
});
it('clears stale evidence if access fails', async () => {
  mock.get.mockRejectedValue(new Error('private detail'));
  render(<ExecutionTimeline workspaceId="w" receiptId="r" canWrite owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load execution timeline' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Timeline unavailable.');
  expect(screen.queryByText('private detail')).toBeNull();
});
it('links an owner-selected repository and PR number', async () => {
  mock.get.mockResolvedValue({ data: [] });
  mock.post.mockResolvedValue({ data: { id: 'event' } });
  mock.repos.mockResolvedValue({ data: [{ id: 'repo-1', owner: 'fixture', name: 'repository' }] });
  render(<ExecutionTimeline workspaceId="w" receiptId="r" canWrite owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load execution timeline' }));
  await screen.findByRole('button', { name: 'Record evidence' });
  fireEvent.change(screen.getByLabelText('Evidence type'), {
    target: { value: 'linked_pull_request' },
  });
  await screen.findByRole('option', { name: 'fixture/repository' });
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo-1' } });
  fireEvent.change(screen.getByLabelText('Pull request number'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Evidence description'), {
    target: { value: 'Delivery PR' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record evidence' }));
  await vi.waitFor(() =>
    expect(mock.post).toHaveBeenCalledWith(
      '/decisions/r/timeline',
      expect.objectContaining({
        kind: 'linked_pull_request',
        repositoryId: 'repo-1',
        pullNumber: 7,
        evidence: 'Delivery PR',
      }),
    ),
  );
});
