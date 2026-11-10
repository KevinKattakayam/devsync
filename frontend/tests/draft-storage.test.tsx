import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import {
  openDraftDatabase,
  commitDraftSnapshot,
  readDraftSnapshot,
  purgeDraftSnapshot,
} from '@/lib/draft-storage';
it('merges two independent replicas atomically and reloads both committed contributions', async () => {
  const name = `devsync:storage-test:${crypto.randomUUID()}`;
  const a = await openDraftDatabase(name),
    b = await openDraftDatabase(name);
  const first = new Y.Doc(),
    second = new Y.Doc();
  first.getMap('draft').set('a', 'first');
  second.getMap('draft').set('b', 'second');
  await Promise.all([
    commitDraftSnapshot(a, Y.encodeStateAsUpdate(first)),
    commitDraftSnapshot(b, Y.encodeStateAsUpdate(second)),
  ]);
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, await readDraftSnapshot(a));
  expect(recovered.getMap('draft').toJSON()).toEqual({ a: 'first', b: 'second' });
  a.close();
  b.close();
  first.destroy();
  second.destroy();
  recovered.destroy();
});
it('rejects an over-limit snapshot without deleting the last committed draft', async () => {
  const db = await openDraftDatabase(`devsync:storage-test:${crypto.randomUUID()}`);
  const first = new Y.Doc();
  first.getText('draft').insert(0, 'previous');
  await commitDraftSnapshot(db, Y.encodeStateAsUpdate(first));
  const oversized = new Y.Doc();
  oversized.getText('draft').insert(0, 'x'.repeat(1024));
  await expect(
    commitDraftSnapshot(db, Y.encodeStateAsUpdate(oversized), 128),
  ).rejects.toMatchObject({ code: 'limit_exceeded' });
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, await readDraftSnapshot(db));
  expect(recovered.getText('draft').toString()).toBe('previous');
  db.close();
  first.destroy();
  oversized.destroy();
  recovered.destroy();
});
it('reads the existing y-indexeddb update format', async () => {
  const name = `devsync:storage-test:${crypto.randomUUID()}`,
    original = new Y.Doc();
  original.getText('draft').insert(0, 'legacy');
  const persistence = new IndexeddbPersistence(name, original);
  await persistence.whenSynced;
  await persistence.destroy();
  const db = await openDraftDatabase(name),
    recovered = new Y.Doc();
  Y.applyUpdate(recovered, await readDraftSnapshot(db));
  expect(recovered.getText('draft').toString()).toBe('legacy');
  db.close();
  original.destroy();
  recovered.destroy();
});
it('reports simulated quota failure only after rollback and retains previous content', async () => {
  const db = await openDraftDatabase(`devsync:storage-test:${crypto.randomUUID()}`);
  const document = new Y.Doc();
  document.getText('draft').insert(0, 'previous');
  await commitDraftSnapshot(db, Y.encodeStateAsUpdate(document));
  document.getText('draft').insert(8, 'new');
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
    throw new DOMException('simulated fixture quota', 'QuotaExceededError');
  });
  try {
    await expect(commitDraftSnapshot(db, Y.encodeStateAsUpdate(document))).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
  } finally {
    add.mockRestore();
  }
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, await readDraftSnapshot(db));
  expect(recovered.getText('draft').toString()).toBe('previous');
  db.close();
  document.destroy();
  recovered.destroy();
});
it('reports closed or denied storage without acknowledging a commit', async () => {
  const db = await openDraftDatabase(`devsync:storage-test:${crypto.randomUUID()}`);
  db.close();
  await expect(commitDraftSnapshot(db, new Uint8Array([0, 0]))).rejects.toMatchObject({
    code: 'failed',
  });
  const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
    throw new DOMException('fixture denied', 'SecurityError');
  });
  try {
    await expect(openDraftDatabase('devsync:fixture-denied')).rejects.toMatchObject({
      code: 'failed',
    });
  } finally {
    open.mockRestore();
  }
});
it('purges atomically and prevents an already-open connection from repopulating the store', async () => {
  const name = `devsync:storage-test:${crypto.randomUUID()}`;
  const first = await openDraftDatabase(name),
    other = await openDraftDatabase(name);
  const document = new Y.Doc();
  document.getText('draft').insert(0, 'private');
  await commitDraftSnapshot(first, Y.encodeStateAsUpdate(document));
  await purgeDraftSnapshot(first);
  await expect(commitDraftSnapshot(other, Y.encodeStateAsUpdate(document))).rejects.toMatchObject({
    code: 'purged',
  });
  await expect(readDraftSnapshot(other)).rejects.toMatchObject({ code: 'purged' });
  first.close();
  other.close();
  document.destroy();
});
it('rolls back the clear if the purge marker cannot be committed', async () => {
  const db = await openDraftDatabase(`devsync:storage-test:${crypto.randomUUID()}`),
    document = new Y.Doc();
  document.getText('draft').insert(0, 'keep me');
  await commitDraftSnapshot(db, Y.encodeStateAsUpdate(document));
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('fixture purge quota', 'QuotaExceededError');
  });
  try {
    await expect(purgeDraftSnapshot(db)).rejects.toMatchObject({ code: 'quota_exceeded' });
  } finally {
    put.mockRestore();
  }
  const recovered = new Y.Doc();
  Y.applyUpdate(recovered, await readDraftSnapshot(db));
  expect(recovered.getText('draft').toString()).toBe('keep me');
  db.close();
  document.destroy();
  recovered.destroy();
});
