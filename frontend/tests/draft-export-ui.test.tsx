import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { DraftExport } from '@/components/workspace/draft-export';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('requires explicit plaintext consent and reports a request rather than a saved file', async () => {
  const create = vi.fn(() => 'blob:fixture');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const document = new Y.Doc();
  render(<DraftExport document={document} principal="alice" room="document:ws:doc" />);
  await userEvent.click(screen.getByText('Local draft recovery'));
  const button = screen.getByRole('button', { name: 'Export local draft' });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Download requested/)).toBeTruthy();
  document.destroy();
});
it('requires separate removal confirmation and does not automatically purge on export', async () => {
  const document = new Y.Doc(),
    purge = vi.fn().mockResolvedValue(undefined);
  render(
    <DraftExport document={document} principal="alice" room="document:ws:doc" onPurge={purge} />,
  );
  await userEvent.click(screen.getByText('Local draft recovery'));
  const button = screen.getByRole('button', { name: 'Remove saved browser draft' });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(purge).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByLabelText(
      'I have preserved any needed edits and confirm removal of this saved browser draft.',
    ),
  );
  await userEvent.click(button);
  expect(purge).toHaveBeenCalledOnce();
  document.destroy();
});
