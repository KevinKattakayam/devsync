import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';

test.setTimeout(240000);
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const output = resolve(__dirname, '../../../docs/ui/after/inbox/phase14-inbox');

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('.shell-main')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axe.source });
  const report = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await writeFile(resolve(output, `${name}.json`), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
  console.log(
    `${name}: ${report.violations.length} axe violations; ${report.incomplete.length} incomplete`,
  );
  expect(report.violations).toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport);
}

test('viewer inbox is responsive, navigable, read-stateful and clears after membership revocation', async ({
  browser,
}) => {
  const digest = `${api}/v2/workspaces/${workspace}/digest`;
  let lastOwner: BrowserContext | undefined;
  let lastViewer: BrowserContext | undefined;
  let lastViewerPage: Page | undefined;
  let lastMembershipId: string | undefined;
  try {
    for (const theme of ['dark', 'light'] as const) {
      for (const width of [1440, 390]) {
        const owner = await browser.newContext({
          viewport: { width, height: 1000 },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        const viewer = await browser.newContext({
          viewport: { width, height: 1000 },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await owner.addInitScript((scheme) => localStorage.setItem('theme', scheme), theme);
        await viewer.addInitScript((scheme) => localStorage.setItem('theme', scheme), theme);
        await login(owner, 'owner');
        await login(viewer, 'viewer');
        const title = `Inbox UI ${theme} ${width}`;
        const created = await owner.request.post(`${api}/workspaces/${workspace}/documents`, {
          data: { title },
        });
        expect(created.status()).toBe(201);
        const document: { id: string } = await created.json();
        const profile = (await (await viewer.request.get(`${api}/auth/me`)).json()) as {
          id: string;
        };
        const boards: { columns: { id: string }[] }[] = await (
          await owner.request.get(`${api}/workspaces/${workspace}/boards`)
        ).json();
        const columnId = boards.flatMap((board) => board.columns)[0]?.id;
        if (!columnId) throw new Error('Missing seeded task column');
        const task = await owner.request.post(`${api}/tasks/columns/${columnId}/tasks`, {
          data: { title: `Inbox task ${theme} ${width}`, assigneeId: profile.id },
        });
        expect(task.status()).toBe(201);
        const preference = (await (await viewer.request.get(`${digest}/preferences`)).json()) as {
          enabled: boolean;
          revision: number;
        };
        if (!preference.enabled)
          expect(
            (
              await viewer.request.put(`${digest}/preferences`, {
                data: { enabled: true, expectedRevision: preference.revision },
              })
            ).status(),
          ).toBe(200);
        const page = await viewer.newPage();
        let release = () => {};
        const preferenceBarrier = new Promise<void>((done) => {
          release = done;
        });
        await viewer.route(
          `**/api/v2/workspaces/${workspace}/digest/preferences*`,
          async (route) => {
            if (route.request().method() === 'GET') await preferenceBarrier;
            await route.continue();
          },
        );
        await page.goto(`/workspace/${workspace}/inbox`);
        await expect(page.getByRole('status').getByText('Checking inbox access')).toBeAttached();
        await capture(page, `${theme}-${width}-loading`);
        release();
        await viewer.unrouteAll({ behavior: 'wait' });
        const list = page.getByRole('list', { name: 'Inbox events' });
        const row = list.getByRole('listitem').filter({ hasText: title });
        await expect(row).toBeVisible();
        await expect(row.getByText('Unread', { exact: true })).toBeVisible();
        await expect(row.getByText('Workspace activity', { exact: true })).toBeVisible();
        const message = await row.locator('p.break-words').textContent();
        if (!message) throw new Error('Inbox event is missing its activity message');
        const documentLink = row.getByRole('link', { name: `Open document: ${message}` });
        await expect(documentLink).toHaveAttribute(
          'href',
          `/workspace/${workspace}/docs/${document.id}`,
        );
        const assignedRow = list
          .getByRole('listitem')
          .filter({ hasText: 'A task was assigned to you.' })
          .first();
        await expect(assignedRow.getByRole('article', { name: /Assigned task:/ })).toBeVisible();
        await expect(assignedRow.getByText('Assigned task', { exact: true })).toBeVisible();
        await expect(
          assignedRow.getByRole('link', { name: 'Open task board: A task was assigned to you.' }),
        ).toHaveAttribute('href', `/workspace/${workspace}/kanban`);
        await capture(page, `${theme}-${width}-unread`);
        const markRead = row.getByRole('button', { name: `Mark read: ${message}` });
        await markRead.focus();
        await expect(markRead).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(row.getByText('Read', { exact: true })).toBeVisible();
        await capture(page, `${theme}-${width}-read`);
        const digestLink = page.getByRole('link', { name: 'Back to digest' });
        const digestHref = await digestLink.getAttribute('href');
        expect(digestHref).toBe(`/workspace/${workspace}/digest`);
        await page.goto(digestHref ?? `/workspace/${workspace}/digest`);
        await expect(page).toHaveURL(new RegExp(`/workspace/${workspace}/digest$`));
        await page.goto(`/workspace/${workspace}/inbox`);
        const refreshedRow = page
          .getByRole('list', { name: 'Inbox events' })
          .getByRole('listitem')
          .filter({ hasText: title });
        await expect(refreshedRow.getByText('Read', { exact: true })).toBeVisible();
        await refreshedRow.getByRole('button', { name: `Mark unread: ${message}` }).click();
        await expect(refreshedRow.getByText('Unread', { exact: true })).toBeVisible();
        if (theme === 'light' && width === 390) {
          lastOwner = owner;
          lastViewer = viewer;
          lastViewerPage = page;
          const identity = (await (await viewer.request.get(`${api}/auth/me`)).json()) as {
            memberships: { id: string; workspaceId: string }[];
          };
          lastMembershipId = identity.memberships.find(
            (item) => item.workspaceId === workspace,
          )?.id;
          if (!lastMembershipId) throw new Error('Missing seeded viewer membership');
          await capture(page, `${theme}-${width}-unread-after-navigation`);
        } else {
          await owner.close();
          await viewer.close();
        }
      }
    }
    if (!lastOwner || !lastViewer || !lastViewerPage || !lastMembershipId)
      throw new Error('Missing final viewer context');
    expect(
      (
        await lastOwner.request.delete(`${api}/workspaces/${workspace}/members/${lastMembershipId}`)
      ).status(),
    ).toBe(200);
    expect((await lastViewer.request.get(`${digest}/inbox`)).status()).toBe(403);
    await lastViewerPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(lastViewerPage.getByRole('list', { name: 'Inbox events' })).toHaveCount(0);
    await expect(lastViewerPage.getByRole('alert').getByText('Inbox unavailable')).toBeVisible();
    await capture(lastViewerPage, 'light-390-revoked-access');
  } finally {
    await lastOwner?.close();
    await lastViewer?.close();
  }
});
