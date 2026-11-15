import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LocalDraftStatus } from '@/components/workspace/local-draft-status';
afterEach(cleanup);
it('distinguishes pending browser writes from committed local transactions', () => {
  const view = render(<LocalDraftStatus status="pending" />);
  expect(screen.getByRole('status').textContent).toContain('awaiting persistence');
  view.rerender(<LocalDraftStatus status="persisted" />);
  expect(screen.getByRole('status').textContent).toBe('Local draft persisted');
  expect(screen.getByRole('status').title).toContain('separate from server acknowledgement');
});
it('announces quota failure without claiming the draft is stored', () => {
  render(<LocalDraftStatus status="quota_exceeded" />);
  expect(screen.getByRole('alert').textContent).toContain('export this draft before closing');
});
