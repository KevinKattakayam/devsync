import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { exportLocalDraft, inspectLocalDraft } from '@/lib/draft-export';
it('exports a detached Yjs snapshot bound to the exact principal and room', () => {
  const document = new Y.Doc();
  document.getText('draft').insert(0, 'local contribution');
  const file = exportLocalDraft(document, 'alice', 'document:ws:doc');
  const snapshot = inspectLocalDraft(file, 'alice', 'document:ws:doc');
  expect(snapshot.getText('draft').toString()).toBe('local contribution');
  expect(() => inspectLocalDraft(file, 'bob', 'document:ws:doc')).toThrow();
  expect(() => inspectLocalDraft(file, 'alice', 'document:other:doc')).toThrow();
  expect(document.getText('draft').toString()).toBe('local contribution');
  snapshot.destroy();
  document.destroy();
});
it('rejects malformed, oversized and unsupported files without mutating a live replica', () => {
  expect(() => inspectLocalDraft('{broken', 'alice', 'room')).toThrow();
  expect(() => inspectLocalDraft('x'.repeat(12 * 1024 * 1024 + 1), 'alice', 'room')).toThrow();
  expect(() => inspectLocalDraft(JSON.stringify({ version: 2 }), 'alice', 'room')).toThrow();
});
it('refuses exports beyond the limit while retaining the live draft', () => {
  const document = new Y.Doc();
  document.getText('draft').insert(0, 'x'.repeat(8 * 1024 * 1024));
  expect(() => exportLocalDraft(document, 'alice', 'room')).toThrow('Draft exceeds export limit');
  expect(document.getText('draft').length).toBe(8 * 1024 * 1024);
  document.destroy();
});
