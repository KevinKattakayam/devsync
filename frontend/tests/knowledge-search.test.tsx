import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), members: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: mocks.get, defaults: { baseURL: '/api/v1' } },
  workspaceApi: { get: mocks.members },
}));
import { KnowledgeSearch } from '@/components/search/knowledge-search';
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.members.mockResolvedValue({
    data: { members: [{ user: { id: 'editor', name: 'Fixture editor' } }] },
  });
});
const item = {
  type: 'document',
  id: 'doc',
  title: 'Quartz document',
  preview: 'Current body',
  updatedAt: '2026-11-08T10:00:00.000Z',
  indexedAt: '2026-11-08T10:00:00.000Z',
  freshness: 'current_projection',
  method: 'lexical',
  href: '/workspace/workspace/docs/doc',
  score: 1,
};
it('labels lexical projection freshness and submits source/time/assignee filters', async () => {
  mocks.get.mockResolvedValue({
    data: { results: [item], retrievedAt: item.updatedAt, semantic: 'not_requested' },
  });
  render(<KnowledgeSearch workspaceId="workspace" />);
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'quartz' } });
  fireEvent.change(screen.getByLabelText('Source type'), { target: { value: 'document' } });
  await screen.findByRole('option', { name: 'Fixture editor' });
  fireEvent.change(screen.getByLabelText('Assignee (tasks only)'), { target: { value: 'editor' } });
  fireEvent.change(screen.getByLabelText('Updated after (UTC)'), {
    target: { value: '2026-11-08T10:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search knowledge' }));
  expect(await screen.findByText('Quartz document')).toBeTruthy();
  expect(screen.getByText(/Current committed projection/)).toBeTruthy();
  expect(mocks.get).toHaveBeenCalledWith(
    '/workspaces/workspace/search',
    expect.objectContaining({
      baseURL: '/api/v2',
      params: expect.objectContaining({
        q: 'quartz',
        type: 'document',
        assigneeId: 'editor',
        after: '2026-11-08T10:00:00.000Z',
      }),
    }),
  );
});
it('rechecks source permission and clears prior titles after denial', async () => {
  mocks.get
    .mockResolvedValueOnce({
      data: { results: [item], retrievedAt: item.updatedAt, semantic: 'not_requested' },
    })
    .mockRejectedValueOnce(new Error('PRIVATE'));
  render(<KnowledgeSearch workspaceId="workspace" />);
  fireEvent.change(screen.getByLabelText('Search text'), { target: { value: 'quartz' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search knowledge' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open Quartz document' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Quartz document')).toBeNull();
  expect(screen.queryByText('PRIVATE')).toBeNull();
});
