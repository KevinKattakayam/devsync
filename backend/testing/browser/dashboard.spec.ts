import { test, expect, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';

declare global {
  interface Window {
    axe: typeof axe;
  }
}
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const pass = process.env.E2E_DASHBOARD_PASS === 'final' ? 'final' : 'initial';
const output = resolve(__dirname, '../../../docs/ui/after/dashboard', pass);

test.beforeAll(async ({ browser }) => {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext();
  try {
    await login(context, 'owner');
    const profile: { id: string } = await (await context.request.get(`${api}/auth/me`)).json();
    const boards: { columns: { tasks: { id: string; assignee?: { id: string } }[] }[] }[] = await (
      await context.request.get(`${api}/workspaces/${workspace}/boards`)
    ).json();
    const task = boards
      .flatMap((board) => board.columns.flatMap((column) => column.tasks))
      .find((task) => task.id === 'devsync-sample-task');
    if (task?.assignee?.id !== profile.id)
      expect(
        (
          await context.request.patch(`${api}/tasks/tasks/devsync-sample-task`, {
            data: { assigneeId: profile.id },
          })
        ).ok(),
      ).toBe(true);
    const documents: { title: string }[] = await (
      await context.request.get(`${api}/workspaces/${workspace}/documents`)
    ).json();
    if (!documents.some((document) => document.title === 'Release checklist'))
      expect(
        (
          await context.request.post(`${api}/workspaces/${workspace}/documents`, {
            data: { title: 'Release checklist' },
          })
        ).status(),
      ).toBe(201);
  } finally {
    await context.close();
  }
});
async function capture(page: Page, theme: string, width: number, state: string) {
  await page.evaluate(() => document.fonts.ready);
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
    report.violations.map(
      (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
  expect(report.bounds.page).toBeLessThanOrEqual(report.bounds.viewport);
  expect(report.bounds.scroll || 0).toBeLessThanOrEqual((report.bounds.main || width) + 1);
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390]) {
    test(`${theme} ${width} dashboard loading, content, filter, errors and dialog`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
        await context.route('**/api/workspaces', async (route) => {
          await barrier;
          await route.continue();
        });
        const page = await context.newPage();
        await page.goto('/dashboard');
        await expect(page.getByRole('status', { name: 'Loading dashboard' })).toBeVisible();
        await capture(page, theme, width, 'loading');
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await expect(page.getByRole('link', { name: /Release checklist/ })).toBeVisible();
        await expect(
          page.getByRole('link', { name: /Review workspace permissions/ }),
        ).toBeVisible();
        await capture(page, theme, width, 'ready');
        await page.getByRole('combobox', { name: 'Dashboard workspace' }).click();
        await page.getByRole('option', { name: 'Sample workspace', exact: true }).click();
        await expect(
          page.getByRole('link', { name: /Review workspace permissions/ }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'New workspace', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
        await capture(page, theme, width, 'create-dialog');
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'New workspace', exact: true }),
        ).toBeFocused();
        await context.route('**/api/auth/me', (route) =>
          route.fulfill({ status: 503, json: { error: 'Injected test outage' } }),
        );
        await page.getByRole('button', { name: 'Refresh dashboard' }).click();
        await expect(
          page.getByText('Your dashboard could not load', { exact: true }),
        ).toBeVisible();
        await capture(page, theme, width, 'error-injected');
        await context.unroute('**/api/auth/me');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(
          page.getByRole('link', { name: /Review workspace permissions/ }),
        ).toBeVisible();
        await context.route('**/api/workspaces/devsync-sample/activities', (route) =>
          route.fulfill({ status: 503, json: { error: 'Injected activity outage' } }),
        );
        await page.getByRole('button', { name: 'Refresh dashboard' }).click();
        await expect(page.getByText('Some work could not load')).toBeVisible();
        await capture(page, theme, width, 'partial-error-injected');
        await context.unroute('**/api/workspaces/devsync-sample/activities');
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(page.getByRole('link', { name: /Release checklist/ })).toBeVisible();
      } finally {
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await context.close();
      }
    });
  }

test('main flow creates a document, undoes via archival, and creates a persisted workspace', async ({
  page,
  context,
}) => {
  await login(context, 'owner');
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Release checklist/ })).toBeVisible();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/workspaces/${workspace}/documents`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const created: { id: string; title: string } = await (await response).json();
  await expect(page.getByText('Document created', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: created.title, exact: true })).toBeVisible();
  const undo = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/documents/${created.id}`) &&
      response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await undo).ok()).toBe(true);
  await expect(page.getByText('Document creation undone', { exact: true })).toBeVisible();
  const list: { id: string }[] = await (
    await context.request.get(`${api}/workspaces/${workspace}/documents`)
  ).json();
  expect(list.some((document) => document.id === created.id)).toBe(false);
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Browser dashboard workspace');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: /Browser dashboard workspace/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /Browser dashboard workspace/ })).toBeVisible();
});

test('viewer has no writer action, and an actual empty account is useful at 360px', async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const viewer = await browser.newContext({
    viewport: { width: 360, height: 1000 },
    reducedMotion: 'reduce',
  });
  let removed: string | undefined;
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const page = await viewer.newPage();
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /Release checklist/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New document', exact: true })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Review workspace permissions/ })).toHaveCount(0);
    const details: { members: { id: string; user: { email: string } }[] } = await (
      await owner.request.get(`${api}/workspaces/${workspace}`)
    ).json();
    const membership = details.members.find(
      (member) => member.user.email === 'sample-viewer@devsync.invalid',
    );
    if (!membership) throw new Error('Seeded viewer missing');
    expect(
      (await owner.request.delete(`${api}/workspaces/${workspace}/members/${membership.id}`)).ok(),
    ).toBe(true);
    removed = membership.id;
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => {
        localStorage.setItem('theme', theme);
      }, theme);
      await page.reload();
      await expect(page.getByText('Make room for your next idea')).toBeVisible();
      await capture(page, theme, 360, 'empty-account');
    }
  } finally {
    if (removed)
      expect(
        (
          await owner.request.post(`${api}/workspaces/${workspace}/invite`, {
            data: { email: 'sample-viewer@devsync.invalid', role: 'VIEWER' },
          })
        ).ok(),
      ).toBe(true);
    await owner.close();
    await viewer.close();
  }
});
