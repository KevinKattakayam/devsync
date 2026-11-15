import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { HocuspocusProviderConfiguration } from '@hocuspocus/provider';
import type { Doc } from 'yjs';
import { StrictMode, type ReactNode } from 'react';
import { useLocalFirstYDoc } from '@/lib/local-first-yjs';
import { useSyncHealthStore } from '@/stores/sync-health.store';

// Only the network transport is simulated here. TipTap/Yjs and IndexedDB
// persistence run in these tests; backend tests exercise the actual protocol.
const transport = vi.hoisted(() => ({
  providers: [] as {
    config: HocuspocusProviderConfiguration;
    document: Doc;
    destroyed: boolean;
    isAuthenticated: boolean;
    tokenSends: number;
  }[],
  sockets: [] as { destroyed: boolean }[],
}));
vi.mock('@hocuspocus/provider', () => ({
  MessageType: { SyncStatus: 8 },
  HocuspocusProviderWebsocket: class {
    destroyed = false;
    constructor() {
      transport.sockets.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  },
  HocuspocusProvider: class {
    destroyed = false;
    isAuthenticated = true;
    tokenSends = 0;
    document: Doc;
    constructor(readonly config: HocuspocusProviderConfiguration) {
      this.document = config.document!;
      transport.providers.push(this);
    }
    async sendToken() {
      if (typeof this.config.token === 'function') await this.config.token();
      this.tokenSends += 1;
    }
    attach() {
      this.config.onAuthenticated?.({ scope: 'read-write' });
      this.config.onSynced?.({ state: true });
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  transport.providers.length = 0;
  transport.sockets.length = 0;
});
const getToken = async () => 'fixture-token';
it('does not attach transport or enable editing when local storage is unavailable', async () => {
  const room = `document:ws:unavailable-${crypto.randomUUID()}`;
  vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
    throw new DOMException('fixture denied', 'SecurityError');
  });
  const view = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(view.result.current.localPersistence).toBe('failed'));
  expect(view.result.current.canWrite).toBe(false);
  expect(transport.providers).toHaveLength(0);
});
it('survives StrictMode effect reacquisition without destroying the active document', async () => {
  const room = `document:ws:strict-${crypto.randomUUID()}`;
  const view = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  await waitFor(() => expect(view.result.current.localPersistence).toBe('persisted'));
  act(() => view.result.current.document.getText('draft').insert(0, 'strict retained'));
  await waitFor(() => expect(view.result.current.localPersistence).toBe('persisted'));
  expect(view.result.current.document.isDestroyed).toBe(false);
  expect(transport.providers.filter((provider) => !provider.destroyed)).toHaveLength(1);
});
it('purges current tabs and refuses network admission when a cleared draft is reopened', async () => {
  const room = `document:ws:purge-${crypto.randomUUID()}`;
  const first = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  const second = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(first.result.current.localPersistence).toBe('persisted'));
  await waitFor(() => expect(second.result.current.localPersistence).toBe('persisted'));
  await act(async () => {
    await first.result.current.purgeLocal();
  });
  await waitFor(() => expect(second.result.current.localPersistence).toBe('purged'));
  expect(first.result.current.canWrite).toBe(false);
  expect(second.result.current.canWrite).toBe(false);
  expect(transport.providers.every((provider) => provider.destroyed)).toBe(true);
  first.unmount();
  second.unmount();
  const count = transport.providers.length;
  const reopened = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(reopened.result.current.localPersistence).toBe('purged'));
  expect(reopened.result.current.localReady).toBe(false);
  expect(transport.providers).toHaveLength(count);
});
it('latches native negative acknowledgements without losing the local copy or accepting renewal as reconciliation', async () => {
  const room = `document:ws:rejected-${crypto.randomUUID()}`;
  const view = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(view.result.current.canWrite).toBe(true));
  const callback = transport.providers[0].config.onMessage;
  type Message = Parameters<NonNullable<typeof callback>>[0]['message'];
  const message = {
    readVarString: () => room,
    readVarUint: vi.fn().mockReturnValueOnce(8).mockReturnValueOnce(0),
  } as unknown as Message; // Network fixture supplies only the decoder methods used by this callback.
  act(() => callback?.({ event: new MessageEvent('message'), message }));
  expect(view.result.current.serverRejected).toBe(true);
  expect(view.result.current.canWrite).toBe(false);
  act(() => transport.providers[0].config.onAuthenticated?.({ scope: 'read-write' }));
  act(() => transport.providers[0].config.onSynced?.({ state: true }));
  expect(view.result.current.canWrite).toBe(false);
  expect(useSyncHealthStore.getState().status).not.toBe('synced');
});
it('reports each local edit pending until committed and reloads it in the same scope', async () => {
  const room = `document:ws:durable-${crypto.randomUUID()}`;
  const view = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(view.result.current.localPersistence).toBe('persisted'));
  act(() => {
    view.result.current.document.getText('draft').insert(0, 'retained');
  });
  expect(view.result.current.localPersistence).toBe('pending');
  await waitFor(() => expect(view.result.current.localPersistence).toBe('persisted'));
  view.unmount();
  const reloaded = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(reloaded.result.current.localReady).toBe(true));
  expect(reloaded.result.current.document.getText('draft').toString()).toBe('retained');
});
it('stops UI editing after simulated quota failure without dropping the in-memory edit', async () => {
  const room = `document:ws:quota-${crypto.randomUUID()}`;
  const view = renderHook(() => useLocalFirstYDoc(room, getToken, 'alice'));
  await waitFor(() => expect(view.result.current.localPersistence).toBe('persisted'));
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
    throw new DOMException('fixture quota', 'QuotaExceededError');
  });
  try {
    act(() => {
      view.result.current.document.getText('draft').insert(0, 'memory only');
    });
    await waitFor(() => expect(view.result.current.localPersistence).toBe('quota_exceeded'));
    expect(view.result.current.canWrite).toBe(false);
    expect(view.result.current.document.getText('draft').toString()).toBe('memory only');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const link = document.createElement('a');
    link.href = '/leave-draft';
    document.body.appendChild(link);
    expect(link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(
      false,
    );
    expect(confirm).toHaveBeenCalledOnce();
    link.remove();
  } finally {
    add.mockRestore();
  }
});

it('isolates replicas by room and account and destroys obsolete network resources', async () => {
  const view = renderHook(({ room, user }) => useLocalFirstYDoc(room, getToken, user), {
    initialProps: { room: 'document:ws:a', user: 'alice' },
  });
  await waitFor(() =>
    expect(view.result.current.localReady && view.result.current.canWrite).toBe(true),
  );
  const first = view.result.current.document;
  act(() => {
    first.getMap('private').set('text', 'Alice only');
  });
  view.rerender({ room: 'document:ws:b', user: 'alice' });
  await waitFor(() => expect(view.result.current.localReady).toBe(true));
  expect(view.result.current.document).not.toBe(first);
  expect(view.result.current.document.getMap('private').get('text')).toBeUndefined();
  view.rerender({ room: 'document:ws:a', user: 'bob' });
  await waitFor(() => expect(view.result.current.localReady).toBe(true));
  expect(view.result.current.document.getMap('private').get('text')).toBeUndefined();
  expect(transport.providers.slice(0, -1).every((provider) => provider.destroyed)).toBe(true);
  expect(transport.sockets.slice(0, -1).every((socket) => socket.destroyed)).toBe(true);
  view.unmount();
  expect(transport.providers.every((provider) => provider.destroyed)).toBe(true);
  expect(transport.sockets.every((socket) => socket.destroyed)).toBe(true);
});

it('uses a fresh token callback and exposes actual pending acknowledgements', async () => {
  const view = renderHook(() => useLocalFirstYDoc('document:ws:pending', getToken, 'alice'));
  await waitFor(() => expect(transport.providers.length).toBe(1));
  const provider = transport.providers[0];
  if (typeof provider.config.token !== 'function') throw new Error('Missing fresh-token callback');
  expect(await provider.config.token()).toBe('fixture-token');
  act(() => {
    provider.config.onUnsyncedChanges?.({ number: 2 });
  });
  expect(view.result.current.pending).toBe(true);
  act(() => {
    provider.config.onUnsyncedChanges?.({ number: 0 });
    provider.config.onAuthenticationFailed?.({ reason: 'Access revoked' });
  });
  expect(view.result.current.pending).toBe(false);
  expect(view.result.current.canWrite).toBe(false);
});

it('renews authenticated sessions with an uncached token and cancels renewal on unmount', async () => {
  const interval = vi.spyOn(window, 'setInterval');
  const clear = vi.spyOn(window, 'clearInterval');
  const token = vi
    .fn<(options?: { skipCache?: boolean }) => Promise<string | null>>()
    .mockResolvedValue('synthetic-access');
  const view = renderHook(() => useLocalFirstYDoc('document:ws:renewal', token, 'alice'));
  await waitFor(() => expect(view.result.current.canWrite).toBe(true));
  const index = interval.mock.calls.findIndex(([, delay]) => delay === 20000);
  const refresh = interval.mock.calls[index]?.[0];
  if (typeof refresh !== 'function') throw new Error('Missing renewal callback');
  const handle = interval.mock.results[index].value;
  const provider = transport.providers[0];
  await act(async () => {
    refresh();
  });
  expect(token).toHaveBeenLastCalledWith({ skipCache: true });
  expect(provider.tokenSends).toBe(1);
  provider.isAuthenticated = false;
  await act(async () => {
    refresh();
  });
  expect(provider.tokenSends).toBe(1);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(handle);
  await act(async () => {
    refresh();
  });
  expect(provider.tokenSends).toBe(1);
});

it('fails closed on renewal failure without exposing provider error text', async () => {
  const interval = vi.spyOn(window, 'setInterval');
  const token = vi
    .fn<(options?: { skipCache?: boolean }) => Promise<string | null>>()
    .mockResolvedValue('synthetic-access');
  const view = renderHook(() => useLocalFirstYDoc('document:ws:renewal-failure', token, 'alice'));
  await waitFor(() => expect(view.result.current.canWrite).toBe(true));
  const refresh = interval.mock.calls.find(([, delay]) => delay === 20000)?.[0];
  if (typeof refresh !== 'function') throw new Error('Missing renewal callback');
  token.mockRejectedValue(new Error('Private provider diagnostic'));
  await act(async () => {
    refresh();
  });
  expect(view.result.current.canWrite).toBe(false);
  expect(view.result.current.syncStatus).toBe('offline');
  const callback = transport.providers[0].config.token;
  if (typeof callback !== 'function') throw new Error('Missing token callback');
  await expect(callback()).rejects.toThrow('Authentication required');
});

it('does not carry a previous room acknowledgement or pending count into a new replica', async () => {
  let release: (value: string) => void = () => {};
  const token = vi
    .fn<(options?: { skipCache?: boolean }) => Promise<string | null>>()
    .mockResolvedValue('fixture-token');
  const view = renderHook(({ room }) => useLocalFirstYDoc(room, token, 'alice'), {
    initialProps: { room: 'document:ws:previous-ack' },
  });
  await waitFor(() => expect(view.result.current.syncStatus).toBe('connected'));
  act(() => transport.providers[0].config.onUnsyncedChanges?.({ number: 3 }));
  token.mockImplementationOnce(() => new Promise<string>((resolve) => (release = resolve)));
  view.rerender({ room: 'document:ws:new-unacknowledged-room' });
  await waitFor(() => expect(view.result.current.localReady).toBe(true));
  expect(view.result.current.syncStatus).toBe('offline');
  expect(view.result.current.pending).toBe(false);
  expect(view.result.current.canWrite).toBe(false);
  await act(async () => release('fixture-token'));
  await waitFor(() => expect(view.result.current.syncStatus).toBe('connected'));
});

it('identifies revoked access separately from reconnectable network loss and resets it per room', async () => {
  const view = renderHook(({ room }) => useLocalFirstYDoc(room, getToken, 'alice'), {
    initialProps: { room: 'document:ws:revoked-access' },
  });
  await waitFor(() => expect(view.result.current.canWrite).toBe(true));
  act(() => {
    transport.providers[0].config.onDisconnect?.({ event: { code: 4403 } as CloseEvent });
  });
  expect(view.result.current).toMatchObject({ canWrite: false, accessDenied: true });
  view.rerender({ room: 'document:ws:another-room' });
  await waitFor(() => expect(view.result.current.canWrite).toBe(true));
  expect(view.result.current).toMatchObject({ accessDenied: false });
});
