import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsPage from '../src/app/(dashboard)/workspace/[id]/settings/page';
import SettingsBoundary from '../src/app/(dashboard)/workspace/[id]/settings/error';
import type { MemberRole } from '../src/lib/workspace-access';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  actor: 'owner-user',
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'one' }) }));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'clerk-other-id' } }),
}));
vi.mock('@/lib/api', () => ({
  default: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.delete },
}));
vi.mock('sonner', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
    loading: mocks.loading,
    dismiss: mocks.dismiss,
  },
}));
const members = [
  {
    id: 'owner-member',
    role: 'OWNER' as MemberRole,
    user: { id: 'owner-user', name: 'Owner', email: 'owner@example.test' },
  },
  {
    id: 'editor-member',
    role: 'EDITOR' as MemberRole,
    user: { id: 'editor-user', name: 'Editor', email: 'editor@example.test' },
  },
  {
    id: 'viewer-member',
    role: 'VIEWER' as MemberRole,
    user: { id: 'viewer-user', name: 'Viewer', email: 'viewer@example.test' },
  },
];
const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  mocks.actor = 'owner-user';
  mocks.get.mockImplementation(async (path: string) => ({
    data: path === '/auth/me' ? { id: mocks.actor } : { id: 'one', name: 'Engineering', members },
  }));
  mocks.patch.mockImplementation(async (_path: string, body: { role: MemberRole }) => ({
    data: { ...members[1], role: body.role },
  }));
  mocks.post.mockResolvedValue({
    data: {
      id: 'invitation',
      email: 'person@example.test',
      role: 'VIEWER',
      expiresAt: '2026-12-01T00:00:00Z',
      acceptedAt: null,
      revokedAt: null,
    },
  });
  mocks.delete.mockResolvedValue({ data: {} });
  mocks.success.mockReturnValue('notice');
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = originalScroll;
});
async function ready() {
  await screen.findByRole('heading', { name: 'Members & roles' });
}
it('loads permissions with the local principal and supports settings/member search', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);
  expect(screen.getByRole('status', { name: 'Loading workspace settings' })).toBeTruthy();
  await ready();
  expect(screen.getByRole('combobox', { name: 'Role for Editor' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Role for Owner' })).toBeNull();
  await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'nonsense');
  expect(screen.getByText('No settings match')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  await user.type(screen.getByRole('textbox', { name: 'Search settings' }), 'editor@example.test');
  expect(screen.getByRole('combobox', { name: 'Role for Editor' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Role for Viewer' })).toBeNull();
});
for (const actor of ['editor-user', 'viewer-user'])
  it(`${actor} cannot reach admin controls in the UI`, async () => {
    mocks.actor = actor;
    render(<SettingsPage />);
    await ready();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create invitation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove / })).toBeNull();
    expect(screen.getByText('Invitations are managed by owners')).toBeTruthy();
  });
it('retries a load failure without pretending the workspace is empty', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Unavailable'));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await ready();
});
it('confirms a keyboard role change, restores focus, and undoes through the same authorized endpoint', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);
  await ready();
  const trigger = screen.getByRole('combobox', { name: 'Role for Editor' });
  trigger.focus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Editor' })),
  );
  await user.keyboard('{ArrowUp}');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Viewer' })),
  );
  await user.keyboard('{Enter}');
  await screen.findByRole('dialog', { name: 'Change member role?' });
  expect(mocks.patch).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm role change' }));
  await waitFor(() =>
    expect(mocks.patch).toHaveBeenCalledWith('/workspaces/one/members/editor-member', {
      role: 'VIEWER',
    }),
  );
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  const call = mocks.success.mock.calls.find(([message]) => message === 'Member role updated');
  const notice = call?.[1] as { action: { onClick: () => void } };
  await act(async () => notice.action.onClick());
  await waitFor(() =>
    expect(mocks.patch).toHaveBeenLastCalledWith('/workspaces/one/members/editor-member', {
      role: 'EDITOR',
    }),
  );
});
it('rolls a denied optimistic role update back and exposes refresh/retry', async () => {
  mocks.patch.mockRejectedValueOnce(new Error('Denied'));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await ready();
  const trigger = screen.getByRole('combobox', { name: 'Role for Editor' });
  trigger.focus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Editor' })),
  );
  await user.keyboard('{ArrowUp}');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Viewer' })),
  );
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Confirm role change' }));
  await screen.findByRole('alert');
  expect(trigger.textContent).toBe('Editor');
  expect(screen.getByRole('button', { name: 'Refresh access' })).toBeTruthy();
});
it('removal requires confirmation and restores the row after failure', async () => {
  mocks.delete.mockRejectedValueOnce(new Error('Denied'));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await ready();
  await user.click(screen.getByRole('button', { name: 'Remove Editor' }));
  expect(mocks.delete).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Remove Editor' })).toBeTruthy();
});
it('creates only recipient-bound EDITOR/VIEWER links and Undo revokes rather than grants membership', async () => {
  const user = userEvent.setup();
  render(<SettingsPage />);
  await ready();
  await user.type(screen.getByRole('textbox', { name: 'Recipient email' }), 'person@example.test');
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByRole('link', { name: 'Open invitation link' });
  expect(mocks.post.mock.calls[0][1]).toEqual({ email: 'person@example.test', role: 'VIEWER' });
  expect(mocks.post.mock.calls[0][2].headers['Idempotency-Key']).toBeTruthy();
  const notice = mocks.success.mock.calls.find(([message]) =>
    String(message).startsWith('Invitation link created'),
  )?.[1] as { action: { onClick: () => void } };
  await act(async () => notice.action.onClick());
  await waitFor(() =>
    expect(mocks.delete).toHaveBeenCalledWith('/workspaces/one/invitations/invitation'),
  );
  expect(screen.queryByRole('link', { name: 'Open invitation link' })).toBeNull();
});
it('preserves invitation details and the receipt on failed creation, then allows retry', async () => {
  mocks.post.mockRejectedValueOnce(new Error('Unavailable'));
  const user = userEvent.setup();
  render(<SettingsPage />);
  await ready();
  await user.type(screen.getByRole('textbox', { name: 'Recipient email' }), 'person@example.test');
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByRole('alert');
  const first = mocks.post.mock.calls[0][2].headers['Idempotency-Key'];
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByRole('link', { name: 'Open invitation link' });
  expect(mocks.post.mock.calls[1][2].headers['Idempotency-Key']).toBe(first);
});
it('retries its route boundary without exposing a private exception', async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(<SettingsBoundary error={new Error('private exception')} retry={retry} />);
  expect(screen.queryByText('private exception')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});
