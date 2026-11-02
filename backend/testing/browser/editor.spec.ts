import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type WebSocketRoute,
} from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const output = resolve(
  __dirname,
  '../../../docs/ui/after/editor',
  process.env.E2E_EDITOR_PASS === 'final' ? 'final' : 'initial',
);
async function createDocument(context: BrowserContext, title: string, populated = true) {
  const created = await context.request.post(`${api}/workspaces/${workspace}/documents`, {
    data: { title },
  });
  expect(created.status()).toBe(201);
  const { id }: { id: string } = await created.json();
  if (populated) {
    const current: { crdtRevision: number } = await (
      await context.request.get(`${api}/documents/${id}`)
    ).json();
    expect(
      (
        await context.request.patch(`${api}/documents/${id}`, {
          data: {
            crdtRevision: current.crdtRevision,
            content: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'A place to think clearly' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Write with your team. Select text to format it, or start a paragraph with / to insert a block.',
                    },
                  ],
                },
                { type: 'paragraph' },
              ],
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  return id;
}
async function capture(page: Page, theme: string, width: number, state: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axe.source });
  const report = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    const main = document.querySelector('.shell-main');
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      bounds: {
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
        main: main?.clientWidth,
        scroll: main?.scrollWidth,
      },
    };
  });
  await writeFile(
    resolve(output, `${theme}-${width}-${state}.json`),
    JSON.stringify(report, null, 2),
  );
  await page.screenshot({
    path: resolve(output, `${theme}-${width}-${state}.png`),
    animations: 'disabled',
    fullPage: true,
  });
  console.log(
    `${theme} ${width} ${state}: ${report.violations.length} axe violations; ${report.incomplete.length} incomplete`,
  );
  expect(
    report.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(report.bounds.page).toBeLessThanOrEqual(width);
  expect(report.bounds.scroll || 0).toBeLessThanOrEqual((report.bounds.main || width) + 1);
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390]) {
    test(`${theme} ${width} editor block flow and review states`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
        const id = await createDocument(context, 'Editor review fixture');
        await context.route(`**/api/documents/${id}`, async (route) => {
          await barrier;
          await route.continue();
        });
        const page = await context.newPage();
        await page.goto(`/workspace/${workspace}/docs/${id}`);
        await expect(page.getByRole('status', { name: 'Loading document content' })).toBeVisible();
        await capture(page, theme, width, 'loading');
        release();
        await context.unrouteAll({ behavior: 'wait' });
        const editor = page.getByRole('textbox', { name: 'Document content', exact: true });
        await expect(editor).toHaveAttribute('contenteditable', 'true');
        await capture(page, theme, width, 'ready');
        await editor.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('/code');
        await expect(page.getByRole('listbox', { name: 'Slash commands' })).toBeVisible();
        await capture(page, theme, width, 'slash');
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('const ready = true;');
        await expect(page.getByRole('group', { name: 'Code block controls' })).toBeVisible();
        await page.getByRole('combobox', { name: 'Code language' }).click();
        await page.getByRole('option', { name: 'typescript', exact: true }).click();
        await page.getByRole('button', { name: 'Copy code', exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => navigator.clipboard.readText()))
          .toBe('const ready = true;');
        await expect(editor.locator('code')).toHaveClass('language-typescript');
        await capture(page, theme, width, 'code');
        await editor.locator('pre').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('/task');
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('Review the release notes');
        const checkbox = page.getByRole('checkbox', { name: 'Task: Review the release notes' });
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await capture(page, theme, width, 'tasks');
        await page.getByRole('button', { name: 'Insert block', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
        await expect(page.getByRole('group', { name: 'Table controls' })).toBeVisible();
        await page.getByRole('button', { name: 'Add row', exact: true }).click();
        await expect(editor.locator('tr')).toHaveCount(4);
        await capture(page, theme, width, 'table');
        await editor.locator('h2').click();
        await page.keyboard.press('Home');
        await page.keyboard.press('Shift+End');
        const bubble = page.locator('[aria-label="Selection formatting"]');
        await expect(bubble).toBeVisible();
        await capture(page, theme, width, 'selection');
        await bubble.getByRole('button', { name: 'Bold', exact: true }).click();
        await expect(editor.locator('h2 strong')).not.toBeEmpty();
        await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'AI Assistant' })).toBeVisible();
        await capture(page, theme, width, 'assistant-dialog');
        await page.keyboard.press('Escape');
        await context.route(`**/api/documents/${id}`, (route) =>
          route.fulfill({ status: 503, json: { error: 'Injected metadata failure' } }),
        );
        await page.reload();
        await expect(page.getByRole('button', { name: 'Retry document' })).toBeVisible();
        await capture(page, theme, width, 'error-injected');
        await context.unrouteAll({ behavior: 'wait' });
        await page.getByRole('button', { name: 'Retry document' }).click();
        await expect(editor).toBeVisible();
      } finally {
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await context.close();
      }
    });
  }
test('two browser contexts merge simultaneous and offline edits; viewer cannot edit at server', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  let remote: HocuspocusProvider | null = null,
    socket: HocuspocusProviderWebsocket | null = null;
  const replica = new Y.Doc();
  try {
    await Promise.all(
      contexts.map((context, index) =>
        login(context, (['owner', 'editor', 'viewer'] as const)[index]),
      ),
    );
    const id = await createDocument(contexts[0], 'Collaboration acceptance fixture');
    let offline = false;
    const links = new Set<WebSocketRoute>();
    await contexts[0].routeWebSocket('**/yjs', (ws) => {
      if (offline) {
        void ws.close({ code: 1001, reason: 'Test network outage' });
        return;
      }
      const server = ws.connectToServer();
      links.add(ws);
      ws.onClose(() => {
        links.delete(ws);
        void server.close();
      });
    });
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map((page) => page.goto(`/workspace/${workspace}/docs/${id}`)));
    for (const page of pages.slice(0, 2))
      await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
    await expect(pages[2].locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(pages[2].getByLabel('Document content')).toHaveAttribute('aria-readonly', 'true');
    await expect(pages[2].getByRole('button', { name: 'Insert block', exact: true })).toHaveCount(
      0,
    );
    const edits = ['Owner simultaneous edit. ', 'Editor simultaneous edit. '];
    await Promise.all(
      pages.slice(0, 2).map(async (page, index) => {
        await page.locator('.ProseMirror').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.insertText(edits[index]);
      }),
    );
    for (const page of pages)
      for (const edit of edits)
        await expect(page.locator('.ProseMirror')).toContainText(edit.trim());
    offline = true;
    await contexts[0].setOffline(true);
    for (const ws of links) await ws.close({ code: 1001, reason: 'Test network outage' });
    await expect(
      pages[0].getByRole('status').filter({ hasText: 'Offline — awaiting sync' }),
    ).toBeVisible();
    await pages[0].locator('.ProseMirror').click();
    await pages[0].keyboard.press('Control+End');
    await pages[0].keyboard.insertText('Offline contribution. ');
    await expect(pages[0].locator('.ProseMirror')).toContainText('Offline contribution.');
    await pages[1].locator('.ProseMirror').click();
    await pages[1].keyboard.press('Control+End');
    await pages[1].keyboard.insertText('Online contribution. ');
    offline = false;
    await contexts[0].setOffline(false);
    for (const page of pages)
      for (const text of ['Offline contribution.', 'Online contribution.'])
        await expect(page.locator('.ProseMirror')).toContainText(text);
    await expect(pages[0].getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
    expect(
      (
        await contexts[2].request.patch(`${api}/documents/${id}`, { data: { title: 'Forbidden' } })
      ).status(),
    ).toBe(403);
    // A separate real protocol client ignores the UI gate and attempts a Yjs update.
    const tokenResponse = await contexts[2].request.get('http://127.0.0.1:5501/__test/token');
    const { token }: { token: string } = await tokenResponse.json();
    socket = new HocuspocusProviderWebsocket({
      url: 'ws://127.0.0.1:5501/yjs',
      WebSocketPolyfill: WebSocket,
    });
    let denied = 0;
    remote = new HocuspocusProvider({
      websocketProvider: socket,
      name: `document:${workspace}:${id}`,
      document: replica,
      token,
      onMessage: ({ message }) => {
        const decoder = decoding.createDecoder(new Uint8Array(message.data as ArrayBuffer));
        decoding.readVarString(decoder);
        if (decoding.readVarUint(decoder) === 8 && decoding.readVarInt(decoder) === 0) denied++;
      },
    });
    remote.attach();
    await expect.poll(() => remote?.synced).toBe(true);
    expect(remote.authorizedScope).toBe('readonly');
    const baseline = denied;
    replica.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);
    await expect.poll(() => denied).toBeGreaterThan(baseline);
    const live: { content: unknown } = await (
      await contexts[0].request.get(`${api}/documents/${id}`)
    ).json();
    expect(JSON.stringify(live.content)).toContain('Offline contribution.');
  } finally {
    remote?.destroy();
    socket?.destroy();
    replica.destroy();
    await Promise.all(contexts.map((context) => context.close()));
  }
});
test('360px empty canvas and viewer remain accessible in both themes', async ({ browser }) => {
  for (const theme of ['dark', 'light'] as const) {
    const owner = await browser.newContext({
      viewport: { width: 360, height: 1000 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    const viewer = await browser.newContext({
      viewport: { width: 360, height: 1000 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    try {
      await login(owner, 'owner');
      await login(viewer, 'viewer');
      for (const context of [owner, viewer])
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
      const id = await createDocument(owner, 'Empty document fixture', false);
      const page = await owner.newPage();
      await page.goto(`/workspace/${workspace}/docs/${id}`);
      await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
      await capture(page, theme, 360, 'empty');
      const read = await viewer.newPage();
      await read.goto(`/workspace/${workspace}/docs/${id}`);
      await expect(read.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
      await capture(read, theme, 360, 'viewer');
    } finally {
      await owner.close();
      await viewer.close();
    }
  }
});
