'use client';

import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSyncHealthStore } from '@/stores/sync-health.store';

export type SyncStatus = 'offline' | 'connecting' | 'connected';

export interface LocalFirstYDoc {
  document: Y.Doc;
  provider: HocuspocusProvider | null;
  localReady: boolean;
  syncStatus: SyncStatus;
}

/**
 * IndexedDB is the write-ahead durable store. Hocuspocus is deliberately
 * secondary: every mutation reaches this Y.Doc synchronously while offline.
 */
export function useLocalFirstYDoc(
  room: string,
  getToken: () => Promise<string | null>,
): LocalFirstYDoc {
  const [document] = useState(() => new Y.Doc());
  const [localReady, setLocalReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const setHealth = useSyncHealthStore((state) => state.setStatus);

  useEffect(() => {
    let disposed = false;
    const persistence = new IndexeddbPersistence(`devsync:${room}`, document);
    void persistence.whenSynced.then(() => {
      if (!disposed) {
        setLocalReady(true);
      }
    });

    let remote: HocuspocusProvider | null = null;
    void getToken().then((token) => {
      if (!token || disposed) return;
      const endpoint = (process.env.NEXT_PUBLIC_YJS_URL || process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:5000').replace(/^http/, 'ws');
      remote = new HocuspocusProvider({
        url: `${endpoint}/yjs`,
        name: room,
        document,
        token,
        onStatus: ({ status }) => {
          if (!disposed) {
            const next = status === 'connected' ? 'connected' : 'connecting';
            setSyncStatus(next);
            setHealth(next === 'connected' ? 'synced' : 'reconnecting');
          }
        },
        onSynced: ({ state }) => {
          if (!disposed && state) {
            setSyncStatus('connected');
            setHealth('synced');
          }
        },
        onDisconnect: () => {
          if (!disposed) {
            setSyncStatus('offline');
            setHealth('offline');
          }
        },
      });
      if (!disposed) setProvider(remote);
    }).catch(() => {
      if (!disposed) {
        setSyncStatus('offline');
        setHealth('offline');
      }
    });

    const actions = document.getMap<string>('devsync:ai-actions');
    const detectPaymentBlock = (): void => {
      for (const value of actions.values()) {
        try { if ((JSON.parse(value) as { rejectionReason?: string }).rejectionReason === 'PAYMENT_REQUIRED') { setHealth('payment_required'); return; } }
        catch { /* Ignore malformed local action; server will reject it safely. */ }
      }
    };
    actions.observe(detectPaymentBlock);

    return () => {
      disposed = true;
      remote?.destroy();
      persistence.destroy();
      actions.unobserve(detectPaymentBlock);
    };
  }, [document, getToken, room, setHealth]);

  return { document, provider, localReady, syncStatus };
}

export interface LocalFirstRecord<T> {
  value: T | null;
  set(value: T): void;
}

/** Local durable JSON record for task/board projections and optimistic edits. */
export function useLocalFirstRecord<T>(document: Y.Doc, key: string): LocalFirstRecord<T> {
  const map = document.getMap<string>(`record:${key}`);
  const [value, setValue] = useState<T | null>(() => {
    const serialized = map.get('value');
    return serialized ? JSON.parse(serialized) as T : null;
  });

  useEffect(() => {
    const update = (): void => {
      const serialized = map.get('value');
      setValue(serialized ? JSON.parse(serialized) as T : null);
    };
    map.observe(update);
    return () => map.unobserve(update);
  }, [map]);

  const set = useCallback((next: T): void => { map.set('value', JSON.stringify(next)); }, [map]);
  return useMemo(() => ({ value, set }), [set, value]);
}
