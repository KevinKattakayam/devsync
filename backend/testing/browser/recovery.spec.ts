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
const output = resolve(__dirname, '../../../docs/quality/realtime-recovery/browser');
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
async function indexedUpdates(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(new Error('Fixture IndexedDB unavailable'));
        open.onsuccess = () => {
          const db = open.result,
            transaction = db.transaction('updates', 'readonly');
          const count = transaction.objectStore('updates').count();
          transaction.oncomplete = () => {
            db.close();
            resolve(count.result);
          };
          transaction.onerror = () => {
            db.close();
            reject(new Error('Fixture IndexedDB read failed'));
          };
        };
      }),
    name,
  );
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
    rejections = [0, 0, 0];
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
          const latency = new Promise<void>((done) => setTimeout(done, delayMs[i]));
          outgoing = outgoing
            .then(() => latency)
            .then(() => {
              if (!closed) server.send(message);
            });
        });
        server.onMessage((message) => {
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
    const initialLocalUpdates = await indexedUpdates(pages[0], localName);
    blocked[0] = true;
    await contexts[0].setOffline(true);
    for (const connection of links[0])
      await connection.close({ code: 1001, reason: 'Injected network disconnection' });
    await expect(pages[0].getByRole('status').filter({ hasText: /^Offline/ })).toBeVisible();
    await append(pages[0], 'LOCAL_RELOAD_RECOVERY ');
    await expect
      .poll(() => indexedUpdates(pages[0], localName))
      .toBeGreaterThan(initialLocalUpdates);
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
    await writeFile(resolve(output, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
    presence?.disconnect();
    await Promise.all(contexts.map((context) => context.close()));
  }
});
