import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AiUsage } from '../src/components/settings/ai-usage';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get, defaults: { baseURL: 'http://localhost/api/v1' } },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('uses v3 and shows independent personal and workspace allowances', async () => {
  get.mockResolvedValue({
    data: {
      resets: { daily: '2026-11-03T00:00:00.000Z', monthly: '2026-12-01T00:00:00.000Z' },
      concurrency: { userLimit: 2, workspaceLimit: 5 },
      user: { daily: 2, monthly: 4, dailyLimit: 10, monthlyLimit: 100 },
      workspace: { daily: 8, monthly: 12, dailyLimit: 20, monthlyLimit: 200 },
    },
  });
  render(<AiUsage workspaceId="current" />);
  expect(await screen.findByText(/2 \/ 10 today/)).toBeTruthy();
  expect(screen.getByText(/8 \/ 20 today/)).toBeTruthy();
  expect(get).toHaveBeenCalledWith('http://localhost/api/v3/ai/usage', {
    params: { workspaceId: 'current' },
  });
});
it('offers a keyboard-operable refresh after failure', async () => {
  get.mockRejectedValue(new Error('offline'));
  render(<AiUsage workspaceId="current" />);
  expect((await screen.findByRole('alert')).textContent).toContain('Usage unavailable');
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Refresh AI usage' }));
  await user.keyboard('{Enter}');
  expect(get).toHaveBeenCalledTimes(2);
});

it('clears previous workspace counts immediately when switching workspaces', async () => {
  get.mockResolvedValueOnce({
    data: {
      user: { daily: 2, monthly: 4, dailyLimit: 10, monthlyLimit: 100 },
      workspace: { daily: 8, monthly: 12, dailyLimit: 20, monthlyLimit: 200 },
    },
  });
  const { rerender } = render(<AiUsage workspaceId="first" />);
  await screen.findByText(/8 \/ 20 today/);
  get.mockReturnValue(new Promise(() => undefined));
  rerender(<AiUsage workspaceId="second" />);
  expect(screen.queryByText(/8 \/ 20 today/)).toBeNull();
});
