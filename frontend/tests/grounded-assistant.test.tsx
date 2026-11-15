import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { ...mock, defaults: { baseURL: '/api' } } }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'fixture' } }) }));
import { GroundedPreview } from '@/components/grounded-assistant';

const response = {
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
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows cited text, source availability and review-only drafts with keyboard submission', async () => {
  mock.post.mockResolvedValue({ data: response });
  const user = userEvent.setup();
  const { container } = render(<GroundedPreview workspaceId="w" />);
  expect(screen.getByRole('heading', { name: 'Grounded workspace preview' })).toBeTruthy();
  expect(screen.getByText(/not verified truth/i)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Document' },
  });
  const submit = screen.getByRole('button', { name: 'Generate preview' });
  screen.getByLabelText('Your question or request').focus();
  await user.tab();
  expect(document.activeElement).toBe(submit);
  await user.keyboard('{Enter}');
  expect(await screen.findByText('Draft task: Review')).toBeTruthy();
  expect(screen.getByText('Fixture summary')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Open cited source 1: Source' })).toHaveLength(2);
  expect(screen.getByText(/Nothing was saved/)).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Available cited sources' })).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(mock.post).toHaveBeenCalledWith(
    '/v3/ai/grounded',
    { workspaceId: 'w', prompt: 'Document', purpose: 'qa' },
    { baseURL: '/api' },
  );
});

it('states when evidence is insufficient without implying a factual answer', async () => {
  mock.post.mockResolvedValue({
    data: { ...response, status: 'insufficient_evidence', claims: [], proposals: [], sources: [] },
  });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Missing subject' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  expect(await screen.findByText('Not enough accessible evidence')).toBeTruthy();
  expect(screen.getByText(/Try a narrower question/)).toBeTruthy();
});

it('explains permission failure safely and provides an explicit retry action', async () => {
  mock.post
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 403 } })
    .mockResolvedValueOnce({ data: response });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/do not have permission/);
  expect(screen.getByRole('button', { name: 'Retry preview' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  expect(await screen.findByText('Preview ready')).toBeTruthy();
  expect(mock.post).toHaveBeenCalledTimes(2);
});

it('reports an unavailable provider or quota without fabricated output', async () => {
  mock.post.mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/currently unavailable/);
  expect(screen.queryByText('Fixture summary')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Grounded preview result' })).toBeNull();
});

it.each([
  [401, 'session may have expired'],
  [429, 'allowance is temporarily exhausted'],
  [500, 'request failed or its response could not be validated'],
])('maps request status %i to safe recovery guidance', async (status, guidance) => {
  mock.post.mockRejectedValue({ isAxiosError: true, response: { status } });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  expect((await screen.findByRole('alert')).textContent).toContain(guidance);
});

it('rejects malformed or unresolved citation responses instead of displaying ungrounded claims', async () => {
  mock.post.mockResolvedValue({
    data: { ...response, claims: [{ text: 'Uncited', references: [99] }] },
  });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Question' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'response could not be validated',
  );
  expect(screen.queryByText('Uncited')).toBeNull();
});

it('clears evidence when a source is no longer visible and never navigates to an untrusted href', async () => {
  mock.post.mockResolvedValue({ data: response });
  mock.get.mockResolvedValue({ data: { results: [{ href: 'https://example.invalid/leak' }] } });
  render(<GroundedPreview workspaceId="w" />);
  fireEvent.change(screen.getByLabelText('Your question or request'), {
    target: { value: 'Document' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
  const [citation] = await screen.findAllByRole('button', { name: 'Open cited source 1: Source' });
  fireEvent.click(citation);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no longer available/));
  expect(screen.queryByText('Fixture summary')).toBeNull();
  expect(mock.get).toHaveBeenCalledTimes(1);
});
