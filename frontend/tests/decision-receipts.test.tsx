import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Receipts } from '../src/components/decisions/decision-receipts';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  sources: vi.fn(),
  source: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  accept: vi.fn(),
  supersede: vi.fn(),
}));
vi.mock('@/lib/workspace-access', () => ({ loadWorkspaceAccess: mocks.access }));
vi.mock('@/lib/decision-receipts', () => ({ decisionApi: mocks }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const receipt = {
  id: 'receipt',
  workspaceId: 'one',
  title: 'Use transactions',
  rationale: 'Keep writes atomic.',
  sourceKind: 'document',
  sourceId: 'doc',
  sourceRevision: 'a'.repeat(64),
  excerpt: 'Source quote',
  revision: 0,
  status: 'DRAFT',
  sourceTitle: 'Design doc',
  sourceChanged: false,
  createdBy: 'editor',
  acceptedBy: null,
  acceptedAt: null,
  supersededById: null,
  createdAt: '2026-11-02T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  mocks.access.mockResolvedValue({
    role: 'OWNER',
    actorId: 'owner',
    workspace: { members: [{ user: { id: 'editor', name: 'Sample editor' } }] },
  });
  mocks.list.mockResolvedValue([receipt]);
  mocks.sources.mockResolvedValue([{ kind: 'document', id: 'doc', title: 'Design doc' }]);
  mocks.source.mockResolvedValue({
    kind: 'document',
    id: 'doc',
    title: 'Design doc',
    text: 'Source quote',
    revision: 'a'.repeat(64),
  });
  mocks.edit.mockResolvedValue({ ...receipt, revision: 1 });
});
it('offers useful empty and retry states without fictional receipts', async () => {
  mocks.list.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([]);
  render(<Receipts workspaceId="one" />);
  expect(screen.getByRole('status', { name: 'Loading decision receipts' })).toBeTruthy();
  expect(await screen.findByRole('alert')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Keep your first decision')).toBeTruthy();
});
it('keeps viewer UI read only and shows source revision evidence', async () => {
  mocks.access.mockResolvedValue({ role: 'VIEWER', actorId: 'viewer', workspace: { members: [] } });
  render(<Receipts workspaceId="one" />);
  expect(await screen.findByRole('heading', { name: receipt.title })).toBeTruthy();
  for (const name of [
    'New receipt',
    'Edit draft',
    'Delete draft',
    'Accept decision',
    'Supersede decision',
  ])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.getByText(/Pinned source revision/).textContent).toContain(receipt.sourceRevision);
  expect(screen.getByText(receipt.excerpt)).toBeTruthy();
});
it('edits a draft with its expected revision and source fingerprint', async () => {
  render(<Receipts workspaceId="one" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit draft' }));
  const dialog = screen.getByRole('dialog');
  const title = within(dialog).getByRole('textbox', { name: 'Decision title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Revised decision');
  await waitFor(() =>
    expect(
      (within(dialog).getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
  expect(mocks.edit).toHaveBeenCalledWith(
    'one',
    'receipt',
    expect.objectContaining({
      title: 'Revised decision',
      sourceRevision: receipt.sourceRevision,
      excerpt: receipt.excerpt,
    }),
    0,
  );
});
it('requires explicit acceptance and prevents stale-source acceptance', async () => {
  mocks.accept.mockResolvedValue(undefined);
  render(<Receipts workspaceId="one" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Accept decision' }));
  expect(mocks.accept).not.toHaveBeenCalled();
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm acceptance' }),
  );
  expect(mocks.accept).toHaveBeenCalledWith('one', receipt.id, 0);
  cleanup();
  mocks.list.mockResolvedValue([{ ...receipt, sourceChanged: true }]);
  render(<Receipts workspaceId="one" />);
  expect(
    ((await screen.findByRole('button', { name: 'Accept decision' })) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
