import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
import { io } from 'socket.io-client';
import { login } from './identities';

const origin = 'http://127.0.0.1:5501',
  api = `${origin}/api/v1`;
const output = process.env.E2E_RECOVERY_OUTPUT_DIR
  ? resolve(process.env.E2E_RECOVERY_OUTPUT_DIR)
  : resolve(__dirname, '../../../docs/quality/realtime-recovery/browser');
async function control(action: string, data?: object) {
  const secret = process.env.E2E_RUN_SECRET;
  if (!secret) throw new Error('Missing isolated fixture capability');
  // Keep capabilities out of browser request instrumentation, screenshots and traces.
  const response = await fetch(`${origin}/__test/recovery/${action}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      'x-e2e-run-secret': secret,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  expect(response.ok).toBe(true);
  return response.status === 204 || response.status === 202 ? null : response.json();
}
const editor = (page: Page) => page.getByRole('textbox', { name: 'Document content', exact: true });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: /^Saved/ });
async function editorText(page: Page) {
  return editor(page).evaluate((element) => {
    const root = element as HTMLElement & { editor?: { getText(): string } };
    if (!root.editor) throw new Error('Missing actual TipTap instance');
    return root.editor.getText(); // Cursor decorations contain names, not document text.
  });
}
async function append(page: Page, value: string) {
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(value);
}
async function indexedText(page: Page, name: string) {
  const rows = await page.evaluate(
    (name) =>
      new Promise<number[][]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(new Error('Fixture IndexedDB unavailable'));
        open.onsuccess = () => {
          const db = open.result,
            transaction = db.transaction('updates', 'readonly');
          const updates = transaction.objectStore('updates').getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve((updates.result as Uint8Array[]).map((value) => Array.from(value)));
          };
          transaction.onerror = () => {
            db.close();
            reject(new Error('Fixture IndexedDB read failed'));
          };
        };
      }),
    name,
  );
  const document = new Y.Doc();
  try {
    for (const row of rows) Y.applyUpdate(document, new Uint8Array(row));
    return document.getXmlFragment('default').toString();
  } finally {
    document.destroy();
  }
}
function snapshotText(record: { yjsState: { data: number[] } }) {
  const snapshot = new Y.Doc();
  try {
    Y.applyUpdate(snapshot, new Uint8Array(record.yjsState.data));
    return snapshot.getXmlFragment('default').toString();
  } finally {
    snapshot.destroy();
  }
}

test('actual browser replicas recover journal and snapshots across latency, offline reload, SIGKILL and revocation (fixture identities)', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const roles = ['owner', 'editor', 'viewer'] as const;
  const delayMs = [0, 0, 0],
    blocked = [false, false, false];
  const acknowledgements = [0, 0, 0],
    rejections = [0, 0, 0],
    clientFrames = [0, 0, 0],
    serverFrames = [0, 0, 0];
  const links = contexts.map(() => new Set<WebSocketRoute>());
  const report: Record<string, unknown> = {
    identity: 'seeded fixtures; not real Clerk',
    status: 'running',
    browserClients: 3,
  };
  let presence: ReturnType<typeof io> | undefined;
  try {
    await mkdir(output, { recursive: true });
    await Promise.all(contexts.map((context, i) => login(context, roles[i])));
    const workspaceResponse = await contexts[0].request.post(`${api}/workspaces`, {
      data: { name: 'Recovery browser fixture' },
    });
    expect(workspaceResponse.status()).toBe(201);
    const { id: workspaceId }: { id: string } = await workspaceResponse.json();
    for (const i of [1, 2]) {
      const joined = await contexts[0].request.post(`${api}/workspaces/${workspaceId}/invite`, {
        data: { email: `sample-${roles[i]}@devsync.invalid`, role: i === 1 ? 'EDITOR' : 'VIEWER' },
      });
      expect(joined.status()).toBe(201);
    }
    const created = await contexts[0].request.post(`${api}/workspaces/${workspaceId}/documents`, {
      data: { title: 'Recovery acceptance fixture' },
    });
    expect(created.status()).toBe(201);
    const { id: documentId }: { id: string } = await created.json(),
      room = { workspaceId, documentId };
    for (const [i, context] of contexts.entries()) {
      await context.routeWebSocket('**/yjs', (client) => {
        if (blocked[i]) {
          void client.close({ code: 1001, reason: 'Injected network disconnection' });
          return;
        }
        const server = client.connectToServer();
        links[i].add(client);
        let closed = false;
        let incoming = Promise.resolve(),
          outgoing = Promise.resolve();
        client.onMessage((message) => {
          clientFrames[i]++;
          const latency = new Promise<void>((done) => setTimeout(done, delayMs[i]));
          outgoing = outgoing
            .then(() => latency)
            .then(() => {
              if (!closed) server.send(message);
            });
        });
        server.onMessage((message) => {
          serverFrames[i]++;
          const latency = new Promise<void>((done) => setTimeout(done, delayMs[i]));
          incoming = incoming
            .then(() => latency)
            .then(() => {
              if (closed) return;
              const bytes = typeof message === 'string' ? Buffer.from(message) : message;
              const decoder = decoding.createDecoder(bytes);
              decoding.readVarString(decoder);
              if (decoding.readVarUint(decoder) === 8) {
                if (decoding.readVarInt(decoder) === 1) acknowledgements[i]++;
                else rejections[i]++;
              }
              client.send(message);
            });
        });
        client.onClose((code, reason) => {
          closed = true;
          links[i].delete(client);
          void server.close({ code, reason });
        });
        server.onClose((code, reason) => {
          closed = true;
          links[i].delete(client);
          void client.close({ code, reason });
        });
      });
    }
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const path = `/workspace/${workspaceId}/docs/${documentId}`;
    await Promise.all(pages.map((page) => page.goto(path)));
    for (const i of [0, 1])
      await expect(editor(pages[i])).toHaveAttribute('contenteditable', 'true');
    await expect(editor(pages[2])).toHaveAttribute('contenteditable', 'false');
    for (const page of pages) await expect(saved(page)).toBeVisible();
    await expect(pages[0].getByText('2 collaborators', { exact: true })).toBeVisible();
    delayMs[0] = 600;
    const beforeAck = acknowledgements[0];
    await Promise.all([
      append(pages[0], 'OWNER_CONCURRENT '),
      append(pages[1], 'EDITOR_CONCURRENT '),
    ]);
    await expect(pages[0].getByRole('status').filter({ hasText: /^Saving/ })).toBeVisible();
    await expect(saved(pages[0])).toBeVisible();
    expect(acknowledgements[0]).toBeGreaterThan(beforeAck);
    for (const page of pages) {
      await expect.poll(() => editorText(page)).toContain('OWNER_CONCURRENT');
      await expect.poll(() => editorText(page)).toContain('EDITOR_CONCURRENT');
    }
    report.concurrentConvergence = true;
    report.injectedLatency = {
      client: 'owner',
      eachDirectionMs: 600,
      scope: 'Hocuspocus frames; HTTP unchanged',
    };
    report.localPendingBeforeRemoteAcknowledgement = true;
    delayMs[0] = 0;

    const identity = await (await contexts[0].request.get(`${api}/auth/me`)).json();
    const localName = `devsync:${identity.id}:document:${workspaceId}:${documentId}`;
    await expect.poll(() => indexedText(pages[0], localName)).toContain('OWNER_CONCURRENT');
    blocked[0] = true;
    await contexts[0].setOffline(true);
    for (const connection of links[0])
      await connection.close({ code: 1001, reason: 'Injected network disconnection' });
    await expect(pages[0].getByRole('status').filter({ hasText: /^Offline/ })).toBeVisible();
    await append(pages[0], 'LOCAL_RELOAD_RECOVERY ');
    await expect.poll(() => indexedText(pages[0], localName)).toContain('LOCAL_RELOAD_RECOVERY');
    await expect(
      pages[0].getByRole('status').filter({ hasText: /^Local draft persisted$/ }),
    ).toBeVisible();
    await append(pages[1], 'ONLINE_DURING_PARTITION ');
    await expect(saved(pages[1])).toBeVisible();
    await pages[0].close();
    await contexts[0].setOffline(false); // HTTP can reload the app; Yjs remains disconnected.
    pages[0] = await contexts[0].newPage();
    await pages[0].goto(path);
    await expect.poll(() => editorText(pages[0])).toContain('LOCAL_RELOAD_RECOVERY');
    await expect(
      pages[0].getByRole('status').filter({ hasText: /^Offline|^Connecting/ }),
    ).toBeVisible();
    blocked[0] = false;
    for (const page of pages) {
      await expect.poll(() => editorText(page)).toContain('LOCAL_RELOAD_RECOVERY');
      await expect.poll(() => editorText(page)).toContain('ONLINE_DURING_PARTITION');
    }
    await expect(saved(pages[0])).toBeVisible();
    report.indexedDbReloadAndPartitionMerge = true;

    const markers = Array.from({ length: 35 }, (_, n) => [`[A${n}]`, `[B${n}]`]);
    for (const pair of markers) await Promise.all(pair.map((value, i) => append(pages[i], value)));
    const allMarkers = markers.flat();
    try {
      for (const page of pages) {
        await expect
          .poll(
            async () => {
              const value = await editorText(page);
              return allMarkers.every((marker) => value.includes(marker));
            },
            { message: 'all repeated edits converge' },
          )
          .toBe(true);
      }
    } catch (error) {
      try {
        const texts = await Promise.all(pages.map(editorText));
        const persisted = await Promise.all(
          pages.map(async (page) => {
            try {
              const text = await indexedText(page, localName);
              return {
                available: true,
                missingMarkers: allMarkers.filter((m) => !text.includes(m)),
              };
            } catch {
              return { available: false, missingMarkers: allMarkers };
            }
          }),
        );
        let canonical = { available: false, missingMarkers: allMarkers };
        try {
          const response = await contexts[0].request.get(`${api}/documents/${documentId}`, {
            timeout: 5000,
          });
          if (response.ok()) {
            const text = snapshotText(await response.json());
            canonical = {
              available: true,
              missingMarkers: allMarkers.filter((m) => !text.includes(m)),
            };
          }
        } catch {
          // Diagnostics are best-effort and deliberately contain marker presence only.
        }
        const serverState = await control('state', { ...room, markers: allMarkers }).catch(
          () => null,
        );
        await writeFile(
          resolve(output, 'convergence-failure.json'),
          JSON.stringify({
            equal: new Set(texts).size === 1,
            replicas: texts.map((text) => ({
              length: text.length,
              missingMarkers: allMarkers.filter((marker) => !text.includes(marker)),
            })),
            indexedDbReplicas: persisted,
            canonicalSnapshot: canonical,
            serverState,
            protocol: { clientFrames, serverFrames, acknowledgements, rejections },
          }),
        );
      } catch {
        console.error('Synthetic convergence diagnostics unavailable');
      }
      throw error;
    }
    for (const i of [0, 1]) await expect(saved(pages[i])).toBeVisible();
    await expect.poll(async () => new Set(await Promise.all(pages.map(editorText))).size).toBe(1);
    const afterRepeated = await control('state', room);
    expect(afterRepeated.revision).toBeGreaterThanOrEqual(70);
    expect(afterRepeated.journalRows).toBeLessThan(64);
    await control('compact', room);
    expect((await control('state', room)).journalRows).toBe(0);
    const checkpoint = await (
      await contexts[0].request.get(`${api}/documents/${documentId}`)
    ).json();
    for (const marker of allMarkers) expect(snapshotText(checkpoint)).toContain(marker);
    await append(pages[0], 'ACKNOWLEDGED_BEFORE_SIGKILL ');
    await expect(saved(pages[0])).toBeVisible();
    const beforeCrash = await control('state', room);
    expect(beforeCrash.journalRows).toBeGreaterThan(0);
    const staleSnapshot = await (
      await contexts[0].request.get(`${api}/documents/${documentId}`)
    ).json();
    expect(snapshotText(staleSnapshot)).not.toContain('ACKNOWLEDGED_BEFORE_SIGKILL');
    const generation = (await control('generation')).generation;
    await control('crash', {});
    await expect
      .poll(
        async () => {
          try {
            return (await control('generation')).generation;
          } catch {
            return generation;
          }
        },
        { timeout: 20000 },
      )
      .toBe(generation + 1);
    await Promise.all(contexts.map((context, i) => login(context, roles[i]))); // Fixture sessions are process-local, unlike Clerk.
    const fresh = await browser.newContext();
    contexts.push(fresh);
    await login(fresh, 'owner');
    const freshPage = await fresh.newPage();
    await freshPage.goto(path);
    await expect.poll(() => editorText(freshPage)).toContain('ACKNOWLEDGED_BEFORE_SIGKILL');
    for (const marker of allMarkers)
      await expect.poll(() => editorText(freshPage)).toContain(marker);
    await Promise.all(pages.map((page) => page.reload()));
    for (const page of pages)
      await expect.poll(() => editorText(page)).toContain('ACKNOWLEDGED_BEFORE_SIGKILL');
    await expect(saved(pages[0])).toBeVisible();
    report.snapshotAndJournalSurviveSigkill = {
      generationBefore: generation,
      generationAfter: generation + 1,
      journalRowsBeforeCrash: beforeCrash.journalRows,
      freshBrowserVerified: true,
    };
    await pages[0].screenshot({
      path: resolve(output, 'recovered-fixture.png'),
      fullPage: true,
      animations: 'disabled',
    });

    const deniedBefore = rejections[2];
    await editor(pages[2]).evaluate((element) => {
      const root = element as HTMLElement & {
        editor?: { commands: { insertContent(value: string): boolean } };
      };
      if (!root.editor) throw new Error('Missing actual TipTap instance');
      root.editor.commands.insertContent('VIEWER_UNAUTHORIZED_UPDATE');
    });
    await expect.poll(() => rejections[2]).toBeGreaterThan(deniedBefore);
    await expect(
      pages[2].getByRole('status').filter({ hasText: /^Server rejected changes/ }),
    ).toBeVisible();
    expect(await editorText(pages[0])).not.toContain('VIEWER_UNAUTHORIZED_UPDATE');
    const canonical = await (
      await contexts[0].request.get(`${api}/documents/${documentId}`)
    ).json();
    expect(JSON.stringify(canonical.content)).not.toContain('VIEWER_UNAUTHORIZED_UPDATE');
    report.viewerUpdateRejectedByActualProtocol = true;

    const fixtureToken = await (await contexts[1].request.get(`${origin}/__test/token`)).json();
    presence = io(origin, {
      transports: ['websocket'],
      auth: { token: fixtureToken.token },
      reconnection: false,
    });
    await expect.poll(() => presence?.connected).toBe(true);
    let joined = false;
    presence.on('workspace:users', () => {
      joined = true;
    });
    presence.emit('workspace:join', { workspaceId, userName: 'fixture editor' });
    await expect.poll(() => joined).toBe(true);
    delayMs[1] = 600;
    await append(pages[1], 'REVOKED_PENDING_UPDATE ');
    await expect(pages[1].getByRole('status').filter({ hasText: /^Saving/ })).toBeVisible();
    const workspace = await (
      await contexts[0].request.get(`${api}/workspaces/${workspaceId}`)
    ).json();
    const member = workspace.members.find(
      (m: { user: { email: string } }) => m.user.email === 'sample-editor@devsync.invalid',
    );
    expect(
      (
        await contexts[0].request.delete(`${api}/workspaces/${workspaceId}/members/${member.id}`)
      ).status(),
    ).toBe(200);
    await expect(
      pages[1].getByRole('status').filter({ hasText: /^Access unavailable/ }),
    ).toBeVisible();
    await expect(editor(pages[1])).toHaveAttribute('contenteditable', 'false');
    await expect.poll(() => presence?.connected).toBe(false);
    await expect.poll(() => links[1].size).toBe(0);
    expect((await contexts[1].request.get(`${api}/documents/${documentId}`)).status()).toBe(403);
    expect(await editorText(pages[0])).not.toContain('REVOKED_PENDING_UPDATE');
    await append(pages[0], 'AFTER_MEMBER_REVOCATION ');
    await expect(saved(pages[0])).toBeVisible();
    expect(await editorText(pages[1])).not.toContain('AFTER_MEMBER_REVOCATION');
    const authoritative = await (
      await contexts[0].request.get(`${api}/documents/${documentId}`)
    ).json();
    expect(JSON.stringify(authoritative.content)).not.toContain('REVOKED_PENDING_UPDATE');
    report.memberRevocation = {
      apiDenied: true,
      yjsClosed: true,
      socketIoClosed: true,
      delayedUpdateNotPersisted: true,
      furtherSubscriptionStopped: true,
    };
    report.status = 'passed';
  } finally {
    if (report.status !== 'passed') report.status = 'failed';
    report.nativeAcknowledgements = acknowledgements;
    report.nativeRejectedUpdates = rejections;
    report.protocolFrames = { client: clientFrames, server: serverFrames };
    await writeFile(resolve(output, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
    presence?.disconnect();
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('confirmed purge stops both current tabs and a reload cannot repopulate the saved draft', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const links = new Set<WebSocketRoute>();
  let blocked = false;
  try {
    await login(context, 'owner');
    await context.routeWebSocket('**/yjs', (client) => {
      if (blocked) {
        void client.close({ code: 1001, reason: 'Offline tab fixture' });
        return;
      }
      const server = client.connectToServer();
      links.add(client);
      client.onMessage((message) => server.send(message));
      server.onMessage((message) => client.send(message));
      client.onClose((code, reason) => {
        links.delete(client);
        void server.close({ code, reason });
      });
      server.onClose((code, reason) => {
        links.delete(client);
        void client.close({ code, reason });
      });
    });
    const workspaceId = 'devsync-sample';
    const response = await context.request.post(`${api}/workspaces/${workspaceId}/documents`, {
      data: { title: 'Purge fixture' },
    });
    expect(response.status()).toBe(201);
    const { id }: { id: string } = await response.json();
    const first = await context.newPage(),
      second = await context.newPage();
    const path = `/workspace/${workspaceId}/docs/${id}`;
    await Promise.all([first.goto(path), second.goto(path)]);
    await expect(editor(first)).toHaveAttribute('contenteditable', 'true');
    await expect(editor(second)).toHaveAttribute('contenteditable', 'true');
    await append(first, 'SERVER_COPY_REMAINS');
    await expect(saved(first)).toBeVisible();
    await expect.poll(() => editorText(second)).toContain('SERVER_COPY_REMAINS');
    const identity = await (await context.request.get(`${api}/auth/me`)).json();
    const localName = `devsync:${identity.id}:document:${workspaceId}:${id}`;
    blocked = true;
    await context.setOffline(true);
    for (const connection of links)
      await connection.close({ code: 1001, reason: 'Offline tab fixture' });
    for (const page of [first, second])
      await expect(page.getByRole('status').filter({ hasText: /^Offline/ })).toBeVisible();
    await append(first, ' OFFLINE_TAB_A ');
    await append(second, ' OFFLINE_TAB_B ');
    await expect.poll(() => indexedText(first, localName)).toContain('OFFLINE_TAB_A');
    await expect.poll(() => indexedText(second, localName)).toContain('OFFLINE_TAB_B');
    await expect
      .poll(async () => {
        const text = await indexedText(first, localName);
        return text.includes('OFFLINE_TAB_A') && text.includes('OFFLINE_TAB_B');
      })
      .toBe(true);
    blocked = false;
    await context.setOffline(false);
    for (const page of [first, second]) {
      await expect.poll(() => editorText(page), { timeout: 45000 }).toContain('OFFLINE_TAB_A');
      await expect.poll(() => editorText(page), { timeout: 45000 }).toContain('OFFLINE_TAB_B');
      await expect(saved(page)).toBeVisible();
    }
    await expect(
      first.getByRole('status').filter({ hasText: /^Local draft persisted$/ }),
    ).toBeVisible();
    await first.getByText('Local draft recovery', { exact: true }).click();
    const remove = first.getByRole('button', { name: 'Remove saved browser draft' });
    await expect(remove).toBeDisabled();
    await first
      .getByLabel(
        'I have preserved any needed edits and confirm removal of this saved browser draft.',
      )
      .check();
    await remove.click();
    for (const page of [first, second]) {
      await expect(
        page.getByRole('status').filter({ hasText: /^Saved browser draft removed$/ }),
      ).toBeVisible();
      await expect(editor(page)).toHaveCount(0);
    }
    await second.reload();
    await expect(
      second.getByRole('status').filter({ hasText: /^Saved browser draft removed$/ }),
    ).toBeVisible();
    await expect(editor(second)).toHaveCount(0);
    const canonical = await (await context.request.get(`${api}/documents/${id}`)).json();
    expect(JSON.stringify(canonical.content)).toContain('SERVER_COPY_REMAINS');
  } finally {
    await context.close();
  }
});

test('injected browser quota abort preserves memory for an actual recovery download', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await login(context, 'owner');
    const workspaceId = 'devsync-sample';
    const response = await context.request.post(`${api}/workspaces/${workspaceId}/documents`, {
      data: { title: 'Quota fixture' },
    });
    expect(response.status()).toBe(201);
    const { id }: { id: string } = await response.json();
    const page = await context.newPage();
    await page.goto(`/workspace/${workspaceId}/docs/${id}`);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    await append(page, 'PREVIOUS_COMMITTED');
    await expect(
      page.getByRole('status').filter({ hasText: /^Local draft persisted$/ }),
    ).toBeVisible();
    const identity = await (await context.request.get(`${api}/auth/me`)).json();
    const name = `devsync:${identity.id}:document:${workspaceId}:${id}`;
    await expect.poll(() => indexedText(page, name)).toContain('PREVIOUS_COMMITTED');
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      let injected = false;
      IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
        if (
          !injected &&
          this.name === 'updates' &&
          this.transaction.db.name.startsWith('devsync:')
        ) {
          injected = true;
          throw new DOMException('Isolated fixture quota injection', 'QuotaExceededError');
        }
        return key === undefined ? add.call(this, value) : add.call(this, value, key);
      };
    });
    await append(page, 'MEMORY_AFTER_QUOTA');
    await expect(page.getByRole('alert').filter({ hasText: 'Browser storage full' })).toBeVisible();
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    expect(await editorText(page)).toContain('MEMORY_AFTER_QUOTA');
    expect(await indexedText(page, name)).not.toContain('MEMORY_AFTER_QUOTA');
    await page.getByText('Local draft recovery', { exact: true }).click();
    await page.getByLabel('I understand this file contains unencrypted workspace data.').check();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export local draft' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('devsync-local-draft.json');
    const path = await download.path();
    if (!path) throw new Error('Missing downloaded fixture export');
    const { readFile } = await import('fs/promises');
    const file = JSON.parse(await readFile(path, 'utf8')) as {
      principal: string;
      room: string;
      update: string;
    };
    expect(file.principal).toBe(identity.id);
    expect(file.room).toBe(`document:${workspaceId}:${id}`);
    const recovered = new Y.Doc();
    Y.applyUpdate(recovered, new Uint8Array(Buffer.from(file.update, 'base64')));
    expect(recovered.getXmlFragment('default').toString()).toContain('MEMORY_AFTER_QUOTA');
    recovered.destroy();
  } finally {
    await context.close();
  }
});

test('membership removed while offline cannot upload a persisted local draft on reconnect', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    editorContext = await browser.newContext();
  const links = new Set<WebSocketRoute>();
  let blocked = false;
  try {
    await login(owner, 'owner');
    await login(editorContext, 'editor');
    const workspaceResponse = await owner.request.post(`${api}/workspaces`, {
      data: { name: 'Offline revocation fixture' },
    });
    expect(workspaceResponse.status()).toBe(201);
    const { id: workspaceId }: { id: string } = await workspaceResponse.json();
    expect(
      (
        await owner.request.post(`${api}/workspaces/${workspaceId}/invite`, {
          data: { email: 'sample-editor@devsync.invalid', role: 'EDITOR' },
        })
      ).status(),
    ).toBe(201);
    const documentResponse = await owner.request.post(
      `${api}/workspaces/${workspaceId}/documents`,
      { data: { title: 'Offline revocation document' } },
    );
    expect(documentResponse.status()).toBe(201);
    const { id: documentId }: { id: string } = await documentResponse.json();
    await editorContext.routeWebSocket('**/yjs', (client) => {
      if (blocked) {
        void client.close({ code: 1001, reason: 'Offline revocation fixture' });
        return;
      }
      const server = client.connectToServer();
      links.add(client);
      client.onMessage((message) => server.send(message));
      server.onMessage((message) => client.send(message));
      client.onClose((code, reason) => {
        links.delete(client);
        void server.close({ code, reason });
      });
      server.onClose((code, reason) => {
        links.delete(client);
        void client.close({ code, reason });
      });
    });
    const page = await editorContext.newPage();
    await page.goto(`/workspace/${workspaceId}/docs/${documentId}`);
    await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
    const identity = await (await editorContext.request.get(`${api}/auth/me`)).json();
    blocked = true;
    await editorContext.setOffline(true);
    for (const connection of links)
      await connection.close({ code: 1001, reason: 'Offline revocation fixture' });
    await expect(page.getByRole('status').filter({ hasText: /^Offline/ })).toBeVisible();
    await append(page, 'OFFLINE_REVOKED_ONLY');
    const localName = `devsync:${identity.id}:document:${workspaceId}:${documentId}`;
    await expect.poll(() => indexedText(page, localName)).toContain('OFFLINE_REVOKED_ONLY');
    const workspace = await (await owner.request.get(`${api}/workspaces/${workspaceId}`)).json();
    const member = workspace.members.find(
      (item: { user: { email: string } }) => item.user.email === 'sample-editor@devsync.invalid',
    );
    if (!member) throw new Error('Missing fixture editor membership');
    expect(
      (
        await owner.request.delete(`${api}/workspaces/${workspaceId}/members/${member.id}`)
      ).status(),
    ).toBe(200);
    blocked = false;
    await editorContext.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: /^Access unavailable/ })).toBeVisible({
      timeout: 45000,
    });
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
    expect((await editorContext.request.get(`${api}/documents/${documentId}`)).status()).toBe(403);
    const canonical = await (await owner.request.get(`${api}/documents/${documentId}`)).json();
    expect(JSON.stringify(canonical.content)).not.toContain('OFFLINE_REVOKED_ONLY');
    expect(await indexedText(page, localName)).toContain('OFFLINE_REVOKED_ONLY');
  } finally {
    await owner.close();
    await editorContext.close();
  }
});
