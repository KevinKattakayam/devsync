import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import KanbanPage from '../src/app/(dashboard)/workspace/[id]/kanban/page';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  move: vi.fn(),
  workspaceId: 'workspace',
  canWriteOverride: true as boolean | null,
  setBoards: null as null | ((value: unknown) => void),
  document: null as import('yjs').Doc | null,
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: mocks.workspaceId }) }));
vi.mock('@/lib/api', () => ({ boardApi: { list: mocks.list }, taskApi: { move: mocks.move } }));
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ getToken: vi.fn(), user: { id: 'user' } }),
}));
vi.mock('@/hooks/use-crdt-garbage-collector', () => ({ useCRDTGarbageCollector: vi.fn() }));
vi.mock('@/lib/workspace-access', () => ({
  loadWorkspaceAccess: vi.fn().mockResolvedValue({ role: 'OWNER' }),
}));
vi.mock('@/components/workspace/portability-controls', () => ({ TaskCsvControls: () => null }));
vi.mock('@/components/sprint-analytics-modal', () => ({ SprintAnalyticsModal: () => null }));
vi.mock('@hocuspocus/provider', () => ({
  MessageType: { SyncStatus: 8 },
  HocuspocusProviderWebsocket: class {
    destroy() {}
  },
  HocuspocusProvider: class {
    constructor(readonly config: import('@hocuspocus/provider').HocuspocusProviderConfiguration) {}
    attach() {
      this.config.onAuthenticated?.({ scope: 'read-write' });
      this.config.onSynced?.({ state: true });
    }
    destroy() {}
    sendToken() {
      return Promise.resolve();
    }
  },
}));
vi.mock('@/lib/local-first-yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/local-first-yjs')>();
  return {
    ...actual,
    useLocalFirstYDoc: (...args: Parameters<typeof actual.useLocalFirstYDoc>) => {
      const sync = actual.useLocalFirstYDoc(...args);
      mocks.document = sync.document;
      return { ...sync, canWrite: mocks.canWriteOverride ?? sync.canWrite };
    },
    useLocalFirstRecord: (...args: Parameters<typeof actual.useLocalFirstRecord>) => {
      const record = actual.useLocalFirstRecord(...args);
      mocks.setBoards = record.set as (value: unknown) => void;
      return record;
    },
  };
});

const boards = [
  {
    id: 'board',
    name: 'Board',
    columns: [
      {
        id: 'a',
        name: 'Todo',
        position: 0,
        tasks: [
          { id: 't', title: 'Task', columnId: 'a', position: 0, priority: 'MEDIUM', labels: [] },
        ],
      },
      { id: 'b', name: 'Done', position: 1, tasks: [] },
    ],
  },
];

function renderPage() {
  return render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 480, itemHeight: 100 }}>
      <KanbanPage />
    </VirtuosoMockContext.Provider>,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  mocks.workspaceId = `workspace-${crypto.randomUUID()}`;
  mocks.canWriteOverride = true;
  mocks.document = null;
  mocks.list.mockReset();
  mocks.move.mockReset();
  mocks.list.mockResolvedValue({ data: boards });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('persists a keyboard-selected column move through the existing Yjs and API handler', async () => {
  const user = userEvent.setup();
  mocks.move.mockResolvedValue({ data: {} });
  renderPage();
  const move = await screen.findByRole('combobox', { name: 'Move Task' });
  move.focus();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('option', { name: 'Done' });
  await user.keyboard('{ArrowDown}{Enter}');

  await waitFor(() => expect(mocks.move).toHaveBeenCalledWith('t', { columnId: 'b', position: 0 }));
  const serialized = mocks.document?.getMap<string>('record:boards').get('value');
  expect(serialized).toBeDefined();
  if (!serialized) throw new Error('Expected the live Yjs board record to be present');
  const persistedBoards = JSON.parse(serialized) as typeof boards;
  expect(persistedBoards[0].columns.find((column) => column.id === 'b')?.tasks[0]?.id).toBe('t');
  expect(
    within(screen.getByRole('group', { name: 'Todo tasks' })).queryByRole('group', {
      name: 'Task',
    }),
  ).toBeNull();
  expect(
    within(screen.getByRole('group', { name: 'Done tasks' })).getByRole('group', {
      name: 'Task',
    }),
  ).toBeTruthy();
});

it('shows a load error if a rejected move is followed by a failed refetch', async () => {
  const user = userEvent.setup();
  mocks.move.mockRejectedValue(new Error('rejected'));
  mocks.list.mockResolvedValueOnce({ data: boards }).mockRejectedValueOnce(new Error('offline'));
  renderPage();
  const move = await screen.findByRole('combobox', { name: 'Move Task' });
  move.focus();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('option', { name: 'Done' });
  await user.keyboard('{ArrowDown}{Enter}');
  await waitFor(() => expect(mocks.move).toHaveBeenCalledWith('t', { columnId: 'b', position: 0 }));
  expect((await screen.findByRole('alert')).textContent).toContain('Board could not load');
});

it('hides move and drag actions when current board permission is read only', async () => {
  mocks.canWriteOverride = false;
  renderPage();
  expect(await screen.findByRole('button', { name: 'Task' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Move Task' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Drag Task' })).toBeNull();
  expect(mocks.move).not.toHaveBeenCalled();
});

it('uses the live Yjs board snapshot to reject a deleted task before persistence', async () => {
  renderPage();
  await screen.findByRole('combobox', { name: 'Move Task' });
  act(() =>
    mocks.setBoards?.([
      { ...boards[0], columns: boards[0].columns.map((column) => ({ ...column, tasks: [] })) },
    ]),
  );
  expect(screen.queryByRole('combobox', { name: 'Move Task' })).toBeNull();
  expect(mocks.move).not.toHaveBeenCalled();
});

it('restores focus to a mounted task trigger after closing the drawer', async () => {
  const user = userEvent.setup();
  renderPage();
  const trigger = await screen.findByRole('button', { name: 'Task' });
  await user.click(trigger);
  expect(await screen.findByRole('dialog', { name: 'Task details' })).toBeTruthy();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
