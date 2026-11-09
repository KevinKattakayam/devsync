import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Inbox } from '../src/components/digest/inbox';
const mocks = vi.hoisted(() => ({
  preference: vi.fn(),
  inbox: vi.fn(),
  automationFailures: vi.fn(),
  setRead: vi.fn(),
  setAutomationRead: vi.fn(),
  notificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  batchPreview: vi.fn(),
}));
vi.mock('@/lib/async-digest', () => ({ digestApi: mocks }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/providers/socket-provider', () => ({ useSocket: () => ({ socket: null }) }));
const event = {
  activityId: 'event',
  recordedAt: '2026-11-02T00:00:00.000Z',
  eventType: 'task_assigned',
  category: 'assigned_task',
  message: 'A task was assigned to you.',
  read: false,
  masked: false,
  source: { version: 1, kind: 'task', id: 'task', revision: '1' },
};
const page = {
  items: [event],
  nextCursor: null,
  from: '2026-11-01T00:00:00.000Z',
  until: '2026-11-02T00:00:00.000Z',
  preferenceRevision: 1,
  automationFailures: [],
};
beforeEach(() => {
  mocks.preference.mockResolvedValue({ enabled: true, revision: 1 });
  mocks.inbox.mockResolvedValue(page);
  mocks.automationFailures.mockResolvedValue({ items: [] });
  mocks.notificationPreferences.mockResolvedValue({
    timezone: 'UTC',
    quietStart: null,
    quietEnd: null,
    batchMinutes: 60,
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('shows recorded assignments and toggles individual read state', async () => {
  render(<Inbox workspaceId="one" />);
  expect(await screen.findByText(event.message)).toBeTruthy();
  expect(screen.getByText('Unread')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Open task board/ }).getAttribute('href')).toBe(
    '/workspace/one/kanban',
  );
  mocks.setRead.mockResolvedValue({ read: true });
  mocks.inbox.mockResolvedValue({ ...page, items: [{ ...event, read: true }] });
  await userEvent.click(screen.getByRole('button', { name: /Mark read/ }));
  expect(mocks.setRead).toHaveBeenCalledWith('one', 'event', true);
  expect(await screen.findByText('Read')).toBeTruthy();
});
it('hides cached activity on reconnection and denies stale responses when access is removed', async () => {
  render(<Inbox workspaceId="one" />);
  expect(await screen.findByText(event.message)).toBeTruthy();
  mocks.preference.mockRejectedValue(new Error('membership removed'));
  window.dispatchEvent(new Event('online'));
  await waitFor(() => expect(screen.queryByText(event.message)).toBeNull());
  expect(await screen.findByRole('alert')).toBeTruthy();
});
it('does not restore a stale response after an offline event', async () => {
  render(<Inbox workspaceId="one" />);
  await screen.findByText(event.message);
  let release: (value: { enabled: boolean; revision: number }) => void = () => {};
  mocks.preference.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('offline'));
  release({ enabled: true, revision: 1 });
  await waitFor(() => expect(screen.queryByText(event.message)).toBeNull());
});
it('clears displayed events when preference access is revoked', async () => {
  mocks.notificationPreferences.mockRejectedValue({
    isAxiosError: true,
    response: { status: 403 },
  });
  render(<Inbox workspaceId="one" />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText(event.message)).toBeNull();
});
it('saves timezone and quiet hours without claiming delivery', async () => {
  render(<Inbox workspaceId="one" />);
  await screen.findByText(event.message);
  await userEvent.click(screen.getByText('Notification scheduling preferences'));
  const zone = await screen.findByLabelText('Time zone');
  await userEvent.clear(zone);
  await userEvent.type(zone, 'America/New_York');
  await userEvent.type(screen.getByLabelText('Quiet hours start'), '22:00');
  await userEvent.type(screen.getByLabelText('Quiet hours end'), '07:00');
  mocks.saveNotificationPreferences.mockResolvedValue({});
  await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(mocks.saveNotificationPreferences).toHaveBeenCalledWith('one', {
    timezone: 'America/New_York',
    quietStart: 1320,
    quietEnd: 420,
    batchMinutes: 60,
  });
  expect(screen.getByText(/No email, push, or scheduled delivery is active/)).toBeTruthy();
  mocks.batchPreview.mockResolvedValue({
    delivery: 'not_scheduled',
    batches: [{ activityIds: ['event'], eligibleAt: '2026-11-02T01:00:00.000Z' }],
    nextCursor: null,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Preview batch windows' }));
  expect(await screen.findByText(/no delivery is scheduled/i)).toBeTruthy();
});
it('shows owner-visible recorded failures and updates their individual read state', async () => {
  const failure = {
    executionId: 'failed-execution',
    category: 'failed_automation',
    recordedAt: '2026-11-02T00:00:00.000Z',
    sourceKind: 'task',
    read: false,
  };
  mocks.automationFailures.mockResolvedValue({ items: [failure] });
  render(<Inbox workspaceId="one" />);
  expect(await screen.findByText(/Automation execution failed/)).toBeTruthy();
  mocks.setAutomationRead.mockResolvedValue({ read: true });
  mocks.automationFailures.mockResolvedValue({ items: [{ ...failure, read: true }] });
  await userEvent.click(
    screen.getByRole('button', { name: 'Mark read: failed execution failed-execution' }),
  );
  expect(mocks.setAutomationRead).toHaveBeenCalledWith('one', failure.executionId, true);
  expect(
    await screen.findByRole('button', { name: 'Mark unread: failed execution failed-execution' }),
  ).toBeTruthy();
});
