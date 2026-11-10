import * as Y from 'yjs';
import {
  commitDraftSnapshot,
  readDraftSnapshot,
  openDraftDatabase,
  DraftStorageError,
  purgeDraftSnapshot,
} from './draft-storage';
export type LocalPersistenceStatus =
  | 'loading'
  | 'pending'
  | 'persisted'
  | 'quota_exceeded'
  | 'limit_exceeded'
  | 'corrupt'
  | 'failed'
  | 'purging'
  | 'purged';
/** One in-flight snapshot and a dirty bit; updates are never queued individually. */
export function attachDraftPersistence(
  document: Y.Doc,
  name: string,
  report: (status: LocalPersistenceStatus) => void,
  options: { write?: typeof commitDraftSnapshot; delayMs?: number } = {},
) {
  let db: IDBDatabase | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let busy: Promise<void> | undefined,
    dirty = true,
    failed = false,
    closing = false,
    stopped = false,
    generation = 0;
  const origin = {};
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== 'undefined')
      channel = new BroadcastChannel(`devsync:draft:${name}`);
  } catch {
    /* Persistence still works; coordinated purge will be refused. */
  }
  const status = (value: LocalPersistenceStatus) => {
    if (!stopped) report(value);
  };
  const fail = (error: unknown) => {
    failed = true;
    status(error instanceof DraftStorageError ? error.code : 'failed');
  };
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'purged' && !stopped) {
        failed = true;
        status('purged');
        db?.close();
      }
    };
  const schedule = () => {
    if (closing || stopped || failed || timer || busy) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, options.delayMs ?? 50);
  };
  const changed = (_update: Uint8Array, source: unknown) => {
    if (source === origin || stopped) return;
    generation++;
    dirty = true;
    if (!failed) {
      status('pending');
      schedule();
    }
  };
  document.on('update', changed);
  const ready = (async () => {
    try {
      db = await openDraftDatabase(name);
      const update = await readDraftSnapshot(db);
      if (!stopped && !failed) {
        Y.applyUpdate(document, update, origin);
        status('pending');
        schedule();
      }
    } catch (error) {
      fail(error);
      throw error;
    }
  })();
  // The hook also observes ready; this prevents detached callers from leaking rejections.
  void ready.catch(() => undefined);
  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    try {
      await ready;
    } catch {
      return;
    }
    if (stopped || failed || !db) return;
    if (busy) {
      await busy;
      if (dirty && !failed) await flush();
      return;
    }
    if (!dirty) return;
    const revision = generation;
    dirty = false;
    const database = db;
    busy = (async () => {
      try {
        const update = Y.encodeStateAsUpdate(document);
        const stored = await (options.write ?? commitDraftSnapshot)(database, update);
        if (!stopped && !failed) {
          Y.applyUpdate(document, stored, origin);
          status(generation === revision ? 'persisted' : 'pending');
        }
      } catch (error) {
        dirty = true;
        fail(error);
      }
    })();
    await busy;
    busy = undefined;
    if (dirty && !failed) await flush();
  }
  return {
    ready,
    flush,
    async purge() {
      if (!channel) throw new DraftStorageError('failed');
      failed = true;
      status('purging');
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      try {
        await ready.catch(() => undefined);
        if (busy) await busy;
        if (!db) throw new DraftStorageError('failed');
        await purgeDraftSnapshot(db);
        status('purged');
        channel?.postMessage('purged');
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    async destroy() {
      closing = true;
      document.off('update', changed);
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await flush();
      stopped = true;
      db?.close();
      channel?.close();
    },
  };
}
