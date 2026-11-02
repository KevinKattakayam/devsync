import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Safety } from '../src/components/snippets/snippet-safety';
import { preflightSnippet } from '../src/lib/snippet-preflight';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  findings: vi.fn(),
}));
vi.mock('@/lib/workspace-access', () => ({ loadWorkspaceAccess: mocks.access }));
vi.mock('@/lib/api', () => ({ snippetApi: { list: mocks.list } }));
vi.mock('@/lib/snippet-safety-api', () => ({
  snippetSafetyApi: { preflight: mocks.preview, save: mocks.save, findings: mocks.findings },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
beforeEach(() => {
  mocks.access.mockResolvedValue({ role: 'EDITOR' });
  mocks.list.mockResolvedValue({ data: [] });
  mocks.preview.mockImplementation(async (_workspaceId, input) => preflightSnippet(input));
});
it('offers real loading and retry after list failure', async () => {
  mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: [] });
  render(<Safety workspaceId="one" />);
  expect(screen.getByRole('status', { name: 'Loading snippet safety' })).toBeTruthy();
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Review preflight' })).toBeTruthy();
});
it('keeps viewer UI read-only', async () => {
  mocks.access.mockResolvedValue({ role: 'VIEWER' });
  render(<Safety workspaceId="one" />);
  expect(await screen.findByText(/You have read-only access/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Review preflight' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Code' })).toBeNull();
});
it('masks local display before explicit save and never renders a raw finding preview', async () => {
  const raw = 'gh' + 'p_' + 'SyntheticFixture'.repeat(3);
  render(<Safety workspaceId="one" />);
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole('textbox', { name: 'Snippet title' }),
    'Reviewed fixture',
  );
  await user.type(screen.getByRole('textbox', { name: 'Code' }), raw);
  await user.click(screen.getByRole('button', { name: 'Review preflight' }));
  await screen.findByRole('heading', { name: 'Review the redacted result' });
  expect(
    (screen.getByRole('textbox', { name: 'Code' }) as HTMLTextAreaElement).value.includes(raw),
  ).toBe(false);
  expect(
    within(screen.getByRole('region', { name: 'Preflight review' })).getByText(
      '[REDACTED:github-token]',
    ),
  ).toBeTruthy();
  expect(mocks.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Edit masked draft' }));
  expect(
    (screen.getByRole('textbox', { name: 'Code' }) as HTMLTextAreaElement).value.includes(raw),
  ).toBe(false);
});
it('shows failed preflight without claiming a save and allows retry', async () => {
  mocks.preview.mockRejectedValueOnce(new Error('unavailable'));
  render(<Safety workspaceId="one" />);
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: 'Snippet title' }), 'Clean fixture');
  await user.type(screen.getByRole('textbox', { name: 'Code' }), 'const value = 42;');
  await user.click(screen.getByRole('button', { name: 'Review preflight' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Nothing was saved');
  expect(mocks.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Review preflight' }));
  expect(await screen.findByRole('button', { name: 'Save redacted snippet' })).toBeTruthy();
});
