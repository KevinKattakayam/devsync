import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import * as Y from 'yjs';
import { attachDraftPersistence } from '@/lib/draft-persistence';
import { commitDraftSnapshot } from '@/lib/draft-storage';
it('keeps later edits pending until their own coalesced transaction commits', async () => {
  const document = new Y.Doc();
  const states: string[] = [];
  let release: () => void = () => {};
  let held = false;
  const session = attachDraftPersistence(
    document,
    `devsync:session:${crypto.randomUUID()}`,
    (state) => states.push(state),
    {
      write: async (db, update) => {
        if (held)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return commitDraftSnapshot(db, update);
      },
    },
  );
  await session.ready;
  await session.flush();
  held = true;
  document.getText('draft').insert(0, 'one');
  const writing = session.flush();
  await Promise.resolve();
  document.getText('draft').insert(3, 'two');
  expect(states.at(-1)).toBe('pending');
  held = false;
  release();
  await writing;
  await session.flush();
  expect(states.at(-1)).toBe('persisted');
  await session.destroy();
  document.destroy();
});
it('merges concurrent tab drafts and reloads them through the live adapter', async () => {
  const name = `devsync:session:${crypto.randomUUID()}`;
  const a = new Y.Doc(),
    b = new Y.Doc();
  const first = attachDraftPersistence(a, name, () => {}),
    second = attachDraftPersistence(b, name, () => {});
  await Promise.all([first.ready, second.ready]);
  a.getMap('draft').set('a', 'one');
  b.getMap('draft').set('b', 'two');
  await Promise.all([first.flush(), second.flush()]);
  await Promise.all([first.destroy(), second.destroy()]);
  const recovered = new Y.Doc(),
    third = attachDraftPersistence(recovered, name, () => {});
  await third.ready;
  expect(recovered.getMap('draft').toJSON()).toEqual({ a: 'one', b: 'two' });
  await third.destroy();
  a.destroy();
  b.destroy();
  recovered.destroy();
});
it('exposes quota failure and retains the in-memory draft for export', async () => {
  const document = new Y.Doc();
  let status = '';
  const session = attachDraftPersistence(
    document,
    `devsync:session:${crypto.randomUUID()}`,
    (state) => {
      status = state;
    },
  );
  await session.ready;
  await session.flush();
  document.getText('draft').insert(0, 'unsaved');
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => {
    throw new DOMException('fixture', 'QuotaExceededError');
  });
  try {
    await session.flush();
  } finally {
    add.mockRestore();
  }
  expect(status).toBe('quota_exceeded');
  expect(document.getText('draft').toString()).toBe('unsaved');
  await session.destroy();
  document.destroy();
});
it('coordinates purge across current tabs and refuses repopulation on reload', async () => {
  const name = `devsync:session:${crypto.randomUUID()}`;
  const a = new Y.Doc(),
    b = new Y.Doc();
  let otherStatus = '';
  const first = attachDraftPersistence(a, name, () => {}),
    second = attachDraftPersistence(b, name, (status) => {
      otherStatus = status;
    });
  await Promise.all([first.ready, second.ready]);
  a.getText('draft').insert(0, 'private');
  await first.flush();
  await first.purge();
  await waitFor(() => expect(otherStatus).toBe('purged'));
  b.getText('draft').insert(0, 'stale');
  await second.flush();
  await Promise.all([first.destroy(), second.destroy()]);
  const recovered = new Y.Doc(),
    third = attachDraftPersistence(recovered, name, () => {});
  await expect(third.ready).rejects.toMatchObject({ code: 'purged' });
  expect(recovered.getText('draft').toString()).toBe('');
  await third.destroy();
  a.destroy();
  b.destroy();
  recovered.destroy();
});
it('refuses purge without cross-tab coordination and keeps the stored draft', async () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const name = `devsync:session:${crypto.randomUUID()}`,
    document = new Y.Doc();
  const session = attachDraftPersistence(document, name, () => {});
  try {
    await session.ready;
    document.getText('draft').insert(0, 'keep');
    await session.flush();
    await expect(session.purge()).rejects.toMatchObject({ code: 'failed' });
  } finally {
    await session.destroy();
    vi.unstubAllGlobals();
  }
  const recovered = new Y.Doc(),
    other = attachDraftPersistence(recovered, name, () => {});
  await other.ready;
  expect(recovered.getText('draft').toString()).toBe('keep');
  await other.destroy();
  document.destroy();
  recovered.destroy();
});
