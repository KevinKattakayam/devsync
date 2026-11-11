import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityFeed } from '../src/components/workspace/activity-feed';

const mocks = vi.hoisted(() => ({ getActivities: vi.fn() }));
vi.mock('@/lib/api', () => ({ workspaceApi: mocks }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('announces the selected activity filter and supports keyboard selection', async () => {
  mocks.getActivities.mockResolvedValue({ data: [] });
  const user = userEvent.setup();
  render(<ActivityFeed workspaceId="workspace" />);

  const filters = screen.getByRole('group', { name: 'Filter activity events' });
  const allEvents = within(filters).getByRole('button', { name: 'All Events' });
  const tasks = within(filters).getByRole('button', { name: 'Tasks' });

  expect(allEvents.getAttribute('aria-pressed')).toBe('true');
  expect(tasks.getAttribute('aria-pressed')).toBe('false');

  tasks.focus();
  await user.keyboard('{Enter}');

  expect(document.activeElement).toBe(tasks);
  expect(tasks.getAttribute('aria-pressed')).toBe('true');
  expect(allEvents.getAttribute('aria-pressed')).toBe('false');
});
