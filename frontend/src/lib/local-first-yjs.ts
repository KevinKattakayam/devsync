'use client';

import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSyncHealthStore } from '@/stores/sync-health.store';

export type SyncStatus = 'offline' | 'connecting' | 'connected';

export interface LocalFirstYDoc {
  document: Y.Doc;
  provider: HocuspocusProvider | null;
  localReady: boolean;
  syncStatus: SyncStatus;
  canWrite: boolean;
  pending: boolean;
  accessDenied: boolean;
}

// StrictMode briefly releases then reacquires the same document. Defer disposal
// until the effect cycle completes; room/account changes own independent replicas.
const leases = new WeakMap<Y.Doc, number>();

/**
 * Mutations reach Y.Doc synchronously and IndexedDB persists them asynchronously.
 * Local persistence and remote journal acknowledgement are separate guarantees.
 */
export function useLocalFirstYDoc(
  room: string,
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>,
  principal: string | undefined,
): LocalFirstYDoc {
  const document = useMemo(
    () => new Y.Doc({ guid: `devsync:${principal ?? 'anonymous'}:${room}` }),
    [room, principal],
  );
  const [readyDocument, setReadyDocument] = useState<Y.Doc | null>(null);
  const [connection, setConnection] = useState<{ document: Y.Doc; status: SyncStatus }>();
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [writableDocument, setWritableDocument] = useState<Y.Doc | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<{ document: Y.Doc; pending: boolean }>();
  const [deniedDocument, setDeniedDocument] = useState<Y.Doc | null>(null);
  const setHealth = useSyncHealthStore((state) => state.setStatus);

  useEffect(() => {
    if (!principal) return;
    leases.set(document, (leases.get(document) ?? 0) + 1);
    let disposed = false;
    const setSyncStatus = (status: SyncStatus) => setConnection({ document, status });
    const persistence = new IndexeddbPersistence(`devsync:${principal}:${room}`, document);
    void persistence.whenSynced
      .then(() => {
        if (!disposed) {
          setReadyDocument(document);
        }
      })
      .catch(() => {
        if (!disposed) setHealth('offline');
      });

    let remote: HocuspocusProvider | null = null;
    let socket: HocuspocusProviderWebsocket | null = null;
    let tokenRefresh: number | undefined;
    let refreshingToken = false;
    void getToken()
      .then((token) => {
        if (!token || disposed) return;
        const endpoint = (
          process.env.NEXT_PUBLIC_YJS_URL ||
          process.env.NEXT_PUBLIC_SOCKET_URL ||
          'ws://localhost:5000'
        ).replace(/^http/, 'ws');
        socket = new HocuspocusProviderWebsocket({
          url: `${endpoint}/yjs`,
          delay: 1000,
          minDelay: 1000,
          maxDelay: 30000,
          factor: 2,
          jitter: true,
        });
        remote = new HocuspocusProvider({
          websocketProvider: socket,
          name: room,
          document,
          token: async () => {
            try {
              const current = await getToken({ skipCache: true });
              if (!current || disposed) throw new Error('Authentication required');
              return current;
            } catch {
              // The provider may surface this reason; never forward identity-provider errors.
              throw new Error('Authentication required');
            }
          },
          onAuthenticated: ({ scope }) => {
            if (!disposed) {
              setDeniedDocument(null);
              setWritableDocument(scope === 'read-write' ? document : null);
            }
          },
          onUnsyncedChanges: ({ number }) => {
            if (!disposed) setAcknowledgements({ document, pending: number > 0 });
          },
          onAuthenticationFailed: () => {
            if (!disposed) {
              setWritableDocument(null);
              setDeniedDocument(document);
              setSyncStatus('offline');
              setHealth('offline');
            }
          },
          onStatus: () => {
            if (!disposed) {
              setSyncStatus('connecting');
              setHealth('reconnecting');
            }
          },
          onSynced: ({ state }) => {
            if (!disposed && state) {
              setSyncStatus('connected');
              setHealth('synced');
            }
          },
          onDisconnect: ({ event }) => {
            if (!disposed) {
              if (event.code === 4403) {
                setWritableDocument(null);
                setDeniedDocument(document);
              }
              setSyncStatus('offline');
              setHealth('offline');
            }
          },
        });
        remote.attach();
        // Short-lived access tokens must renew before the server's expiry sweep.
        // Renewal still runs the server's identity, membership and role policy.
        tokenRefresh = window.setInterval(() => {
          if (disposed || !remote?.isAuthenticated || refreshingToken) return;
          refreshingToken = true;
          void remote
            .sendToken()
            .catch(() => {
              if (!disposed) {
                setWritableDocument(null);
                setSyncStatus('offline');
                setHealth('offline');
              }
            })
            .finally(() => {
              refreshingToken = false;
            });
        }, 20000);
        if (!disposed) setProvider(remote);
      })
      .catch(() => {
        if (!disposed) {
          setSyncStatus('offline');
          setHealth('offline');
        }
      });

    const actions = document.getMap<string>('devsync:ai-actions');
    const detectPaymentBlock = (): void => {
      for (const value of actions.values()) {
        try {
          if (
            (JSON.parse(value) as { rejectionReason?: string }).rejectionReason ===
            'PAYMENT_REQUIRED'
          ) {
            setHealth('payment_required');
            return;
          }
        } catch {
          /* Ignore malformed local action; server will reject it safely. */
        }
      }
    };
    actions.observe(detectPaymentBlock);

    return () => {
      disposed = true;
      if (tokenRefresh !== undefined) window.clearInterval(tokenRefresh);
      remote?.destroy();
      socket?.destroy();
      void persistence.destroy();
      actions.unobserve(detectPaymentBlock);
      leases.set(document, (leases.get(document) ?? 1) - 1);
      queueMicrotask(() => {
        if (!leases.get(document)) document.destroy();
      });
    };
  }, [document, getToken, principal, room, setHealth]);

  return {
    document,
    provider: provider?.document === document ? provider : null,
    localReady: readyDocument === document,
    syncStatus: connection?.document === document ? connection.status : 'offline',
    canWrite: writableDocument === document,
    pending: acknowledgements?.document === document ? acknowledgements.pending : false,
    accessDenied: deniedDocument === document,
  };
}

export interface LocalFirstRecord<T> {
  value: T | null;
  error: 'invalid_json' | null;
  set(value: T): boolean;
}

/** A room-scoped projection; malformed stored data is preserved for recovery. */
export function useLocalFirstRecord<T>(document: Y.Doc, key: string): LocalFirstRecord<T> {
  const map = document.getMap<string>(`record:${key}`);
  const subscribe = useCallback(
    (changed: () => void) => {
      map.observe(changed);
      return () => map.unobserve(changed);
    },
    [map],
  );
  const snapshot = useCallback(() => map.get('value'), [map]);
  const serialized = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const result = useMemo(() => {
    if (serialized === undefined) return { value: null, error: null };
    try {
      return { value: JSON.parse(serialized) as T, error: null };
    } catch {
      return { value: null, error: 'invalid_json' as const };
    }
  }, [serialized]);
  const set = useCallback(
    (next: T): boolean => {
      const existing = map.get('value');
      if (existing !== undefined) {
        try {
          JSON.parse(existing);
        } catch {
          return false;
        }
      }
      map.set('value', JSON.stringify(next));
      return true;
    },
    [map],
  );
  return useMemo(() => ({ ...result, set }), [result, set]);
}
