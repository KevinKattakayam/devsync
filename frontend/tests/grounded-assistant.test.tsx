import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { ...mock, defaults: { baseURL: '/api' } } }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'fixture' } }) }));
import { GroundedPreview } from '@/components/grounded-assistant';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('shows cited plain text and reviewable drafts without a write action', async () => {
  mock.post.mockResolvedValue({
    data: {
      status: 'preview',
      notice: 'Excerpts are not verified truth',
      claims: [{ text: 'Fixture summary', references: [1] }],
      proposals: [{ kind: 'task', title: 'Review', description: 'Draft only', references: [1] }],
      sources: [
        {
          reference: 1,
          type: 'document',
          id: 'd',
          title: 'Source',
          indexedAt: '2026-11-09T00:00:00Z',
        },
      ],
      latencyMs: 10,
    },
  });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Evidence question'), { target: { value: 'Document' } });
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'meeting_tasks' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate evidence preview' }));
  expect(await screen.findByText('Draft task: Review')).toBeTruthy();
  expect(screen.getByText(/preview has not saved work/)).toBeTruthy();
  expect(mock.post).toHaveBeenCalledTimes(1);
  mock.get.mockRejectedValue(new Error('Access removed'));
  fireEvent.click(screen.getByRole('button', { name: /Source — indexed/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('Source unavailable');
  expect(screen.queryByText('Fixture summary [1]')).toBeNull();
});
it('reports unavailable provider or quota without fabricated output', async () => {
  mock.post.mockRejectedValue(new Error('unavailable'));
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Evidence question'), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate evidence preview' }));
  expect((await screen.findByRole('alert')).textContent).toContain('No work was created');
  expect(screen.queryByRole('status')).toBeNull();
});
