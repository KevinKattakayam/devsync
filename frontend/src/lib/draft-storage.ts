import * as Y from 'yjs';
export const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
export class DraftStorageError extends Error {
  constructor(readonly code: 'limit_exceeded' | 'quota_exceeded' | 'failed' | 'corrupt') {
    super(`Local draft storage: ${code}`);
  }
}
export function openDraftDatabase(name: string): Promise<IDBDatabase> {
  if (!name.startsWith('devsync:') || name.length > 1024)
    return Promise.reject(new DraftStorageError('failed'));
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name);
    } catch (error) {
      reject(
        new DraftStorageError(
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? 'quota_exceeded'
            : 'failed',
        ),
      );
      return;
    }
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('updates'))
        db.createObjectStore('updates', { autoIncrement: true });
      if (!db.objectStoreNames.contains('custom')) db.createObjectStore('custom');
    };
    request.onerror = () => {
      settled = true;
      reject(
        new DraftStorageError(
          request.error?.name === 'QuotaExceededError' ? 'quota_exceeded' : 'failed',
        ),
      );
    };
    request.onblocked = () => {
      settled = true;
      reject(new DraftStorageError('failed'));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains('updates') || !db.objectStoreNames.contains('custom')) {
        db.close();
        reject(new DraftStorageError('corrupt'));
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
/** Shared store format with y-indexeddb. Completion means the IDB transaction committed. */
function snapshotTransaction(
  db: IDBDatabase,
  incoming: Uint8Array | undefined,
  limit: number,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_DRAFT_BYTES ||
    (incoming && incoming.byteLength > limit)
  )
    return Promise.reject(new DraftStorageError('limit_exceeded'));
  return new Promise((resolve, reject) => {
    const document = new Y.Doc();
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction('updates', incoming ? 'readwrite' : 'readonly');
    } catch {
      document.destroy();
      reject(new DraftStorageError('failed'));
      return;
    }
    let failure: DraftStorageError | undefined, result: Uint8Array | undefined;
    let bytes = incoming?.byteLength ?? 0,
      rows = 0;
    const abort = (code: DraftStorageError['code']) => {
      failure = new DraftStorageError(code);
      transaction.abort();
    };
    transaction.onabort = () => {
      document.destroy();
      reject(
        failure ??
          new DraftStorageError(
            transaction.error?.name === 'QuotaExceededError' ? 'quota_exceeded' : 'failed',
          ),
      );
    };
    transaction.oncomplete = () => {
      document.destroy();
      if (result) resolve(result);
      else reject(new DraftStorageError('failed'));
    };
    const store = transaction.objectStore('updates');
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        const value: unknown = entry.value;
        if (
          !ArrayBuffer.isView(value) ||
          Object.prototype.toString.call(value) !== '[object Uint8Array]'
        ) {
          abort('corrupt');
          return;
        }
        bytes += value.byteLength;
        if (++rows > 1024 || bytes > MAX_DRAFT_BYTES * 2) {
          abort('limit_exceeded');
          return;
        }
        try {
          Y.applyUpdate(document, new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        } catch {
          abort('corrupt');
          return;
        }
        entry.continue();
      } else {
        try {
          if (incoming) Y.applyUpdate(document, incoming);
          result = Y.encodeStateAsUpdate(document);
          if (result.byteLength > limit) {
            abort('limit_exceeded');
            return;
          }
        } catch {
          abort('corrupt');
          return;
        }
        if (incoming && result) {
          try {
            store.clear();
            store.add(result);
          } catch (error) {
            abort(
              error instanceof DOMException && error.name === 'QuotaExceededError'
                ? 'quota_exceeded'
                : 'failed',
            );
          }
        }
      }
    };
  });
}
export function commitDraftSnapshot(
  db: IDBDatabase,
  snapshot: Uint8Array,
  limit = MAX_DRAFT_BYTES,
) {
  return snapshotTransaction(db, snapshot, limit);
}
export function readDraftSnapshot(db: IDBDatabase) {
  return snapshotTransaction(db, undefined, MAX_DRAFT_BYTES);
}
