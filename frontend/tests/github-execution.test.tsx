import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: mocks.get, defaults: { baseURL: '/api/v1' } },
  githubRepositoryApi: { list: mocks.list },
}));
import { GitHubExecution } from '@/components/settings/github-execution';
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ data: [{ id: 'repo', owner: 'fixture', name: 'repository' }] });
  mocks.get.mockResolvedValue({
    data: {
      items: [
        {
          kind: 'pull_request',
          subject: '7',
          state: 'merged',
          conclusion: null,
          headSha: 'a'.repeat(40),
          providerAt: '2026-11-08T10:00:00Z',
          observedAt: '2026-11-08T10:01:00Z',
        },
      ],
      liveAccess: 'not_verified',
      deployment: 'unknown',
    },
  });
});
it('shows timestamped PR evidence without equating merged with deployed or live access', async () => {
  render(<GitHubExecution workspaceId="workspace" />);
  await screen.findByRole('option', { name: 'fixture/repository' });
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo' } });
  const link = await screen.findByRole('link', { name: 'PR #7' });
  expect(link.getAttribute('href')).toBe('https://github.com/fixture/repository/pull/7');
  expect(screen.getByText(/Deployment: unknown/)).toBeTruthy();
  expect(screen.getByText(/Live GitHub access is not verified/)).toBeTruthy();
  expect(screen.getByText('2026-11-08T10:00:00Z').getAttribute('datetime')).toBe(
    '2026-11-08T10:00:00Z',
  );
  expect(mocks.get).toHaveBeenCalledWith(
    '/workspaces/workspace/github-repositories/repo/execution',
    { baseURL: '/api/v2' },
  );
});
it('does not display stale evidence after authorization or API failure', async () => {
  mocks.get.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL'));
  render(<GitHubExecution workspaceId="workspace" />);
  await screen.findByRole('option', { name: 'fixture/repository' });
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo' } });
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('PRIVATE_PROVIDER_DETAIL')).toBeNull();
  expect(screen.queryByRole('link', { name: 'PR #7' })).toBeNull();
});

it('shows recorded App withdrawal as disconnected without stale PR evidence', async () => {
  mocks.get.mockResolvedValue({
    data: { items: [], liveAccess: 'disconnected', deployment: 'unknown' },
  });
  render(<GitHubExecution workspaceId="workspace" />);
  await screen.findByRole('option', { name: 'fixture/repository' });
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo' } });
  expect(await screen.findByText(/GitHub app disconnected/)).toBeTruthy();
  expect(screen.getByText(/Recorded evidence is hidden/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'PR #7' })).toBeNull();
});
