import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  boards: vi.fn(),
  repos: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  default: { ...mock, defaults: { baseURL: '/api' } },
  boardApi: { list: mock.boards },
  githubRepositoryApi: { list: mock.repos },
}));
import { AutomationRules } from '@/components/settings/automation-rules';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('only owners can create and opt in rules', async () => {
  mock.get.mockResolvedValue({ data: [] });
  const view = render(<AutomationRules workspaceId="w" owner={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  expect(await screen.findByText('No automation rules.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create disabled rule' })).toBeNull();
  view.unmount();
  mock.post.mockResolvedValue({
    data: {
      id: 'r',
      title: 'Review',
      trigger: 'task_review',
      action: 'notify',
      condition: 'always',
      debounceSeconds: 30,
      enabled: false,
      version: 1,
    },
  });
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  fireEvent.change(await screen.findByLabelText('Rule name'), { target: { value: 'Review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create disabled rule' }));
  expect(await screen.findByText('Review')).toBeTruthy();
  expect(mock.post).toHaveBeenCalledWith(
    '/workspaces/w/automation',
    expect.objectContaining({ title: 'Review', trigger: 'task_review', action: 'notify' }),
    expect.any(Object),
  );
  expect(screen.getByRole('button', { name: 'Enable Review' })).toBeTruthy();
});
it('clears rules when current access is lost', async () => {
  mock.get.mockRejectedValue(new Error('removed'));
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
});
it('previews a task event and requires a separate owner approval', async () => {
  mock.boards.mockResolvedValue({
    data: [{ columns: [{ tasks: [{ id: 'task-1', title: 'Review API' }] }] }],
  });
  const rule = {
    id: 'r',
    title: 'Review',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions')
      ? {
          data: [
            {
              id: 'e',
              ruleId: 'r',
              eventId: 'v',
              status: 'pending_approval',
              current: true,
              trigger: 'task_review',
              origin: 'human_assertion',
              taskId: 'task-1',
              action: 'notify',
              source: { kind: 'task', title: 'Review API', actorId: 'author' },
              errorCode: null,
              createdAt: '2026-11-09T00:00:00.000Z',
              audit: [],
            },
          ],
        }
      : { data: [rule] },
  );
  mock.post.mockImplementation(async (path: string) =>
    path.endsWith('/preview')
      ? { data: { eligible: true, requiresApproval: true, reason: 'eligible' } }
      : { data: { eventId: 'v', executions: [{ id: 'e' }] } },
  );
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview Review' }));
  await screen.findByRole('option', { name: 'Review API' });
  fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'task-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview event' }));
  expect(await screen.findByText('Eligible — owner approval is required.')).toBeTruthy();
  expect(mock.post).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Submit event for approval' }));
  expect(await screen.findByRole('button', { name: 'Approve Review execution' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Approve Review execution' }));
  expect(mock.post).toHaveBeenCalledWith(
    '/workspaces/w/automation/executions/e/approve',
    {},
    expect.any(Object),
  );
});
it('explains a debounce and does not offer event submission', async () => {
  const rule = {
    id: 'r',
    title: 'Review',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions') ? { data: [] } : { data: [rule] },
  );
  mock.boards.mockResolvedValue({
    data: [{ columns: [{ tasks: [{ id: 'task-1', title: 'Review API' }] }] }],
  });
  mock.post.mockResolvedValue({
    data: { eligible: false, requiresApproval: true, reason: 'debounced' },
  });
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview Review' }));
  await screen.findByRole('option', { name: 'Review API' });
  fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'task-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview event' }));
  expect(await screen.findByText('A matching event is inside the debounce window.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Submit event for approval' })).toBeNull();
});
it('labels a locally recorded PR report as unverified provider access', async () => {
  const rule = {
    id: 'r',
    title: 'PR report',
    trigger: 'pr_merged',
    action: 'prepare_report',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions')
      ? {
          data: [
            {
              id: 'e',
              ruleId: 'r',
              status: 'completed',
              current: true,
              trigger: 'pr_merged',
              origin: 'signed_webhook',
              action: 'prepare_report',
              source: {
                kind: 'github',
                repository: 'fixture/repo',
                subject: '83',
                providerAt: '2026-11-09T00:00:00.000Z',
                observedAt: '2026-11-09T00:00:01.000Z',
                liveAccess: 'not_verified',
              },
              errorCode: null,
              createdAt: '2026-11-09T00:00:00.000Z',
              audit: [],
              report: {
                kind: 'signed_webhook_record',
                repository: 'fixture/repo',
                pullNumber: 83,
                providerAt: '2026-11-09T00:00:00.000Z',
                observedAt: '2026-11-09T00:00:01.000Z',
                liveAccess: 'not_verified',
              },
            },
          ],
        }
      : { data: [rule] },
  );
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  expect(await screen.findByText(/Live GitHub access is not verified/)).toBeTruthy();
  expect(screen.getByText(/Recorded PR merge: fixture\/repo #83/)).toBeTruthy();
});
it('clears displayed rules and execution data when task access fails', async () => {
  const rule = {
    id: 'r',
    title: 'Previously visible task rule',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions') ? { data: [] } : { data: [rule] },
  );
  mock.boards.mockRejectedValue(new Error('access revoked'));
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Preview Previously visible task rule' }),
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Previously visible task rule')).toBeNull();
});
it('shows the authorized source and intended action before approval', async () => {
  const rule = {
    id: 'r',
    title: 'Review',
    trigger: 'task_review',
    action: 'notify',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions')
      ? {
          data: [
            {
              id: 'e',
              ruleId: 'r',
              status: 'pending_approval',
              current: true,
              origin: 'human_assertion',
              trigger: 'task_review',
              errorCode: null,
              createdAt: '2026-11-09T00:00:00.000Z',
              action: 'notify',
              source: { kind: 'task', title: 'Review API', actorId: 'author' },
              audit: [],
            },
          ],
        }
      : { data: [rule] },
  );
  render(
    <AutomationRules
      workspaceId="w"
      owner
      members={[{ user: { id: 'author', name: 'Editor' } }]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  expect(await screen.findByText(/Task: Review API/)).toBeTruthy();
  expect(screen.getByText(/Asserted by: Editor/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve Review execution' })).toBeTruthy();
});
it('previews a recorded PR without fabricating a webhook event', async () => {
  const rule = {
    id: 'r',
    title: 'PR report',
    trigger: 'pr_merged',
    action: 'prepare_report',
    condition: 'always',
    debounceSeconds: 30,
    enabled: true,
    version: 1,
  };
  mock.repos.mockResolvedValue({ data: [{ id: 'repo', owner: 'fixture', name: 'project' }] });
  mock.get.mockImplementation(async (path: string) =>
    path.endsWith('/executions')
      ? { data: [] }
      : path.endsWith('/execution')
        ? {
            data: {
              items: [
                {
                  kind: 'pull_request',
                  subject: '83',
                  state: 'merged',
                  conclusion: null,
                  providerAt: '2026-11-09T00:00:00.000Z',
                },
              ],
              liveAccess: 'not_verified',
            },
          }
        : { data: [rule] },
  );
  mock.post.mockResolvedValue({
    data: { eligible: true, requiresApproval: true, reason: 'eligible' },
  });
  render(<AutomationRules workspaceId="w" owner />);
  fireEvent.click(screen.getByRole('button', { name: 'Load automation rules' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preview PR report' }));
  await screen.findByRole('option', { name: 'fixture/project' });
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'repo' } });
  await screen.findByRole('option', { name: /PR #83/ });
  fireEvent.change(screen.getByLabelText('Recorded event'), { target: { value: '83' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview event' }));
  expect(await screen.findByText(/Preview does not create or execute work/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Submit event for approval' })).toBeNull();
});
