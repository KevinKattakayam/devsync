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
it('uses v2 and shows independent personal and workspace allowances', async () => {
  get.mockResolvedValue({
    data: {
      user: { daily: 2, monthly: 4, dailyLimit: 10, monthlyLimit: 100 },
      workspace: { daily: 8, monthly: 12, dailyLimit: 20, monthlyLimit: 200 },
    },
  });
  render(<AiUsage workspaceId="current" />);
  expect(await screen.findByText(/2 \/ 10 today/)).toBeTruthy();
  expect(screen.getByText(/8 \/ 20 today/)).toBeTruthy();
  expect(get).toHaveBeenCalledWith('http://localhost/api/v2/ai/usage', {
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
