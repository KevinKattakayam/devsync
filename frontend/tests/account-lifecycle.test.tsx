import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  sessions: vi.fn(),
  revoke: vi.fn(),
  workspace: vi.fn(),
  requestExport: vi.fn(),
  transfer: vi.fn(),
  update: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@/lib/account-lifecycle', () => ({ accountLifecycle: mocks }));
vi.mock('@/lib/api', () => ({ workspaceApi: { update: mocks.update } }));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'provider-user', email: 'fixture@example.test' },
    logout: mocks.logout,
  }),
}));
import AccountSettings from '../src/app/(dashboard)/settings/page';
import { WorkspaceLifecycle } from '../src/components/settings/lifecycle';
import type { Workspace } from '../src/types';
const workspace = {
  id: 'a',
  name: 'Alpha',
  description: 'Test',
  members: [
    { id: 'owner-member', role: 'OWNER', user: { id: 'owner', email: 'owner@example.test' } },
    {
      id: 'editor-member',
      role: 'EDITOR',
      user: { id: 'editor', name: 'Editor', email: 'editor@example.test' },
    },
  ],
} as Workspace;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue({
    deletionAvailable: false,
    providerManaged: true,
    ownedWorkspaces: [{ id: 'a', name: 'Alpha', activeOwners: 1, requiresTransfer: true }],
    steps: ['Coordinate retention with the operator.'],
  });
  mocks.sessions.mockResolvedValue({
    items: [{ id: 'sess_fixture', current: false, createdAt: 0, lastActiveAt: 0 }],
    hasMore: false,
  });
  mocks.workspace.mockResolvedValue({
    workspaceName: 'Alpha',
    retainedCrdtBackups: 1,
    requests: [],
    deletionRequiresReview: true,
  });
  mocks.requestExport.mockResolvedValue({ id: 'request', status: 'REVIEW_REQUIRED' });
  mocks.revoke.mockResolvedValue(undefined);
  mocks.transfer.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({});
});
it('shows sole ownership prerequisites and requires confirmation before revoking an owned provider session', async () => {
  render(<AccountSettings />);
  await screen.findByText(/only active owner/);
  expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke other session' }));
  expect(mocks.revoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm session revocation' }));
  await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith('sess_fixture'));
  await screen.findByText(/Clerk confirmed/);
});
it('does not turn provider errors into an empty session list or a successful revocation', async () => {
  mocks.sessions.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));
  render(<AccountSettings />);
  await screen.findByText(/session details are unavailable/);
  expect(screen.queryByText(/No active sessions/)).toBeNull();
  expect(screen.queryByText(/PRIVATE_DETAIL/)).toBeNull();
});
it('records export review only after exact-name confirmation and saves workspace metadata', async () => {
  const user = userEvent.setup();
  render(<WorkspaceLifecycle workspace={workspace} actorId="owner" refresh={() => {}} />);
  await screen.findByText(/no automatic download/i);
  await user.click(screen.getByRole('button', { name: 'Request workspace export' }));
  expect(
    screen.getByRole('button', { name: 'Record export request' }).hasAttribute('disabled'),
  ).toBe(true);
  await user.type(screen.getByLabelText('Confirm workspace name'), 'Alpha');
  await user.click(screen.getByRole('button', { name: 'Record export request' }));
  await waitFor(() => expect(mocks.requestExport).toHaveBeenCalledWith('a', 'Alpha'));
  await screen.findByText(/No file, email or export job/);
  await user.click(screen.getByRole('button', { name: 'Save workspace details' }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith('a', { name: 'Alpha', description: 'Test' }),
  );
});
