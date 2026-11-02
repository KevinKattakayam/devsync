import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/shell/app-shell';
import { DocumentTree } from '../src/components/shell/document-tree';

const state = vi.hoisted(() => ({
  path: '/workspace/one/docs',
  role: 'OWNER',
  push: vi.fn(),
  logout: vi.fn(),
  theme: vi.fn(),
  list: vi.fn(),
  docs: vi.fn(),
  create: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => state.path,
  useRouter: () => ({ push: state.push }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ setTheme: state.theme }) }));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'principal', name: 'Test developer' },
    isLoading: false,
    isAuthenticated: true,
    logout: state.logout,
  }),
}));
vi.mock('@/providers/socket-provider', () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));
vi.mock('@/components/ai-copilot-drawer', () => ({ AiCopilotDrawer: () => null }));
vi.mock('@/lib/api', () => ({
  workspaceApi: { list: state.list },
  documentApi: { list: state.docs, create: state.create },
  boardApi: { list: async () => ({ data: [] }) },
  snippetApi: { list: async () => ({ data: [] }) },
}));
beforeEach(() => {
  state.path = '/workspace/one/docs';
  state.role = 'OWNER';
  state.list.mockImplementation(async () => ({
    data: [
      { id: 'one', name: 'First workspace', role: state.role, members: [] },
      { id: 'two', name: 'Second workspace', role: 'VIEWER', members: [] },
    ],
  }));
  state.docs.mockResolvedValue({
    data: [{ id: 'parent', title: 'Parent', children: [{ id: 'child', title: 'Child' }] }],
  });
  state.create.mockResolvedValue({ data: { id: 'created' } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('document navigation uses keyboard disclosures and exposes its active link', async () => {
  const user = userEvent.setup();
  render(
    <DocumentTree
      nodes={[{ id: 'parent', title: 'Parent', children: [{ id: 'child', title: 'Child' }] }]}
      workspaceId="one"
      pathname="/workspace/one/docs"
      onNavigate={vi.fn()}
    />,
  );
  await user.tab();
  await user.keyboard('{Enter}');
  expect(
    screen.getByRole('button', { name: 'Collapse Parent' }).getAttribute('aria-expanded'),
  ).toBe('true');
  expect(screen.getByRole('link', { name: 'Child' }).getAttribute('href')).toBe(
    '/workspace/one/docs/child',
  );
});
it('shares navigation, breadcrumbs and focus mode while respecting editable shortcut targets', async () => {
  const user = userEvent.setup();
  render(
    <AppShell>
      <h1>Documents</h1>
      <input aria-label="Notes" />
    </AppShell>,
  );
  await screen.findByRole('button', { name: 'Switch workspace: First workspace' });
  expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain(
    'First workspace',
  );
  await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Enter focus mode' }));
  expect(screen.queryByRole('complementary')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Exit focus mode' }));
  await user.click(screen.getByRole('textbox', { name: 'Notes' }));
  await user.keyboard('?');
  expect(screen.queryByRole('dialog')).toBeNull();
  screen.getByRole('main').focus();
  await user.keyboard('?');
  expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  await user.keyboard('{Escape}');
});
for (const role of ['OWNER', 'VIEWER']) {
  it(`commands filter actual resources and ${role} has the correct creation action`, async () => {
    state.role = role;
    const user = userEvent.setup();
    render(
      <AppShell>
        <h1>Documents</h1>
      </AppShell>,
    );
    await screen.findByRole('button', { name: 'Switch workspace: First workspace' });
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox', { name: 'Search commands' });
    await user.type(input, 'Create new document');
    if (role === 'OWNER') {
      await user.keyboard('{Enter}');
      await waitFor(() => expect(state.create).toHaveBeenCalledWith('one'));
      await waitFor(() => expect(state.push).toHaveBeenCalledWith('/workspace/one/docs/created'));
    } else {
      expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe(
        'No matching commands.',
      );
      expect(state.create).not.toHaveBeenCalled();
    }
  });
}
it('workspace navigation drops prior-scope resources before the new request completes', async () => {
  const { rerender } = render(
    <AppShell>
      <h1>Documents</h1>
    </AppShell>,
  );
  await screen.findByRole('link', { name: 'Parent' });
  state.docs.mockImplementationOnce(() => new Promise(() => {}));
  state.path = '/workspace/two/docs';
  rerender(
    <AppShell>
      <h1>Documents</h1>
    </AppShell>,
  );
  expect(screen.queryByRole('link', { name: 'Parent' })).toBeNull();
});
