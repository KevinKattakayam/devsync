import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { HocuspocusProviderConfiguration } from '@hocuspocus/provider';
import type { Doc } from 'yjs';
import { useLocalFirstYDoc } from '@/lib/local-first-yjs';

// Only the network transport is simulated here. TipTap/Yjs and IndexedDB
// persistence run in these tests; backend tests exercise the actual protocol.
const transport = vi.hoisted(() => ({ providers: [] as { config: HocuspocusProviderConfiguration; document: Doc; destroyed: boolean }[], sockets: [] as { destroyed: boolean }[] }));
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProviderWebsocket: class {
    destroyed = false;
    constructor() { transport.sockets.push(this); }
    destroy() { this.destroyed = true; }
  },
  HocuspocusProvider: class {
    destroyed = false;
    document: Doc;
    constructor(readonly config: HocuspocusProviderConfiguration) { this.document = config.document!; transport.providers.push(this); }
    attach() { this.config.onAuthenticated?.({ scope: 'read-write' }); this.config.onSynced?.({ state: true }); }
    destroy() { this.destroyed = true; }
  },
}));
afterEach(() => { cleanup(); transport.providers.length = 0; transport.sockets.length = 0; });
const getToken = async () => 'fixture-token';

it('isolates replicas by room and account and destroys obsolete network resources', async () => {
  const view = renderHook(({ room, user }) => useLocalFirstYDoc(room, getToken, user), { initialProps: { room: 'document:ws:a', user: 'alice' } });
  await waitFor(() => expect(view.result.current.localReady && view.result.current.canWrite).toBe(true));
  const first = view.result.current.document;
  act(() => { first.getMap('private').set('text', 'Alice only'); });
  view.rerender({ room: 'document:ws:b', user: 'alice' });
  await waitFor(() => expect(view.result.current.localReady).toBe(true));
  expect(view.result.current.document).not.toBe(first);
  expect(view.result.current.document.getMap('private').get('text')).toBeUndefined();
  view.rerender({ room: 'document:ws:a', user: 'bob' });
  await waitFor(() => expect(view.result.current.localReady).toBe(true));
  expect(view.result.current.document.getMap('private').get('text')).toBeUndefined();
  expect(transport.providers.slice(0, -1).every(provider => provider.destroyed)).toBe(true);
  expect(transport.sockets.slice(0, -1).every(socket => socket.destroyed)).toBe(true);
  view.unmount();
  expect(transport.providers.every(provider => provider.destroyed)).toBe(true);
  expect(transport.sockets.every(socket => socket.destroyed)).toBe(true);
});

it('uses a fresh token callback and exposes actual pending acknowledgements', async () => {
  const view = renderHook(() => useLocalFirstYDoc('document:ws:pending', getToken, 'alice'));
  await waitFor(() => expect(transport.providers.length).toBe(1));
  const provider = transport.providers[0];
  if (typeof provider.config.token !== 'function') throw new Error('Missing fresh-token callback');
  expect(await provider.config.token()).toBe('fixture-token');
  act(() => { provider.config.onUnsyncedChanges?.({ number: 2 }); });
  expect(view.result.current.pending).toBe(true);
  act(() => { provider.config.onUnsyncedChanges?.({ number: 0 }); provider.config.onAuthenticationFailed?.({ reason: 'Access revoked' }); });
  expect(view.result.current.pending).toBe(false);
  expect(view.result.current.canWrite).toBe(false);
});
