import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useLocalFirstRecord } from '@/lib/local-first-yjs';
afterEach(cleanup);
it('never borrows a previous document draft when the document or record key changes', () => {
  const first = new Y.Doc(),
    second = new Y.Doc();
  first.getMap('record:boards').set('value', JSON.stringify(['private']));
  const view = renderHook(({ document, key }) => useLocalFirstRecord<string[]>(document, key), {
    initialProps: { document: first, key: 'boards' },
  });
  expect(view.result.current.value).toEqual(['private']);
  view.rerender({ document: second, key: 'boards' });
  expect(view.result.current.value).toBeNull();
  act(() => {
    second.getMap('record:boards').set('value', JSON.stringify(['current']));
  });
  expect(view.result.current.value).toEqual(['current']);
  view.rerender({ document: second, key: 'other' });
  expect(view.result.current.value).toBeNull();
});
it('reports malformed local data and preserves it rather than silently replacing it', () => {
  const document = new Y.Doc();
  const map = document.getMap<string>('record:boards');
  map.set('value', '{broken');
  const view = renderHook(() => useLocalFirstRecord<string[]>(document, 'boards'));
  expect(view.result.current.error).toBe('invalid_json');
  act(() => {
    expect(view.result.current.set(['replacement'])).toBe(false);
  });
  expect(map.get('value')).toBe('{broken');
});
