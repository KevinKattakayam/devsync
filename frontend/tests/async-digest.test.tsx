import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Digest, DigestSource } from '../src/components/digest/async-digest';
const mocks = vi.hoisted(() => ({
  preference: vi.fn(),
  setEnabled: vi.fn(),
  items: vi.fn(),
  acknowledge: vi.fn(),
  event: vi.fn(),
}));
vi.mock('@/lib/async-digest', () => ({ digestApi: mocks }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'fixture' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const preference = { enabled: true, revision: 1, acknowledgedAt: null, acknowledgedId: null };
const item = {
  activityId: 'recorded-event',
  recordedAt: '2026-11-02T00:00:00.000Z',
  eventType: 'doc_created',
  message: 'Recorded fixture document creation',
  masked: false,
  source: { version: 1, kind: 'document', id: 'doc', revision: '0' },
};
const page = {
  items: [item],
  nextCursor: null,
  until: '2026-11-02T01:00:00.000Z',
  from: '2026-10-26T01:00:00.000Z',
  preferenceRevision: 1,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
beforeEach(() => {
  mocks.preference.mockResolvedValue(preference);
  mocks.items.mockResolvedValue(page);
});
it('requires explicit personal opt in and does not load activity while off', async () => {
  mocks.preference.mockResolvedValue({ ...preference, enabled: false, revision: 0 });
  render(<Digest workspaceId="one" />);
  expect(screen.getByRole('status', { name: 'Loading async digest' })).toBeTruthy();
  const button = await screen.findByRole('button', { name: 'Enable my digest' });
  expect(mocks.items).not.toHaveBeenCalled();
  expect(mocks.setEnabled).not.toHaveBeenCalled();
  mocks.setEnabled.mockImplementation(async () => {
    mocks.preference.mockResolvedValue(preference);
    return preference;
  });
  await userEvent.click(button);
  expect(await screen.findByText(item.message)).toBeTruthy();
  expect(mocks.setEnabled).toHaveBeenCalledWith('one', true, 0);
});
it('renders a stable source link for a real-shaped event and never treats message text as markup', async () => {
  mocks.items.mockResolvedValue({
    ...page,
    items: [{ ...item, message: '<script>untrusted recorded text</script>' }],
  });
  render(<Digest workspaceId="one" />);
  expect(await screen.findByText('<script>untrusted recorded text</script>')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View recorded source' }).getAttribute('href')).toBe(
    '/workspace/one/digest/activity/recorded-event',
  );
  expect(document.querySelector('script')).toBeNull();
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});
it('offers an honest empty state and retries failed access without invented events', async () => {
  mocks.preference.mockRejectedValueOnce(new Error('unavailable'));
  mocks.items.mockResolvedValue({ ...page, items: [] });
  render(<Digest workspaceId="one" />);
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No eligible events in this window')).toBeTruthy();
  expect(screen.getByText(/This does not mean nothing happened/)).toBeTruthy();
});
it('marks only the displayed chronological checkpoint after an explicit action', async () => {
  render(<Digest workspaceId="one" />);
  const button = await screen.findByRole('button', { name: 'Mark through this event as seen' });
  mocks.acknowledge.mockResolvedValue({ ...preference, revision: 2 });
  mocks.items.mockResolvedValue({ ...page, items: [] });
  await userEvent.click(button);
  expect(mocks.acknowledge).toHaveBeenCalledWith('one', item.activityId, 1);
  expect(await screen.findByText('No eligible events in this window')).toBeTruthy();
});
it('loads a source proof by ID, retries revoked/unavailable sources and links the current resource', async () => {
  mocks.event.mockRejectedValueOnce(new Error('source unavailable')).mockResolvedValue(item);
  render(<DigestSource workspaceId="one" activityId={item.activityId} />);
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(item.message)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open document' }).getAttribute('href')).toBe(
    '/workspace/one/docs/doc',
  );
  expect(mocks.event).toHaveBeenCalledWith('one', item.activityId);
});
it('uses the returned cursor for the next page and replaces the displayed window page', async () => {
  mocks.items
    .mockResolvedValueOnce({ ...page, nextCursor: 'scope-bound-cursor' })
    .mockResolvedValueOnce({
      ...page,
      items: [{ ...item, activityId: 'second', message: 'Second recorded fixture event' }],
    });
  render(<Digest workspaceId="one" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  expect(await screen.findByText('Second recorded fixture event')).toBeTruthy();
  expect(screen.queryByText(item.message)).toBeNull();
  expect(mocks.items).toHaveBeenLastCalledWith('one', 'scope-bound-cursor');
});
