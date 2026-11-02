import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';
test.setTimeout(120000);
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const endpoint = `${api}/v2/workspaces/${workspace}/digest`;
const output = resolve(
  __dirname,
  '../../../docs/ui/after/async-digest',
  process.env.E2E_ASYNC_DIGEST_PASS || 'initial',
);
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
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
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  console.log(
    `${name}: ${report.violations.length} axe violations; ${report.incomplete.length} incomplete`,
  );
  expect(report.violations).toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport);
}

async function turnOff(context: BrowserContext) {
  const response = await context.request.get(`${endpoint}/preferences`);
  expect(response.status()).toBe(200);
  const pref: { enabled: boolean; revision: number } = await response.json();
  if (pref.enabled)
    expect(
      (
        await context.request.put(`${endpoint}/preferences`, {
          data: { enabled: false, expectedRevision: pref.revision },
        })
      ).status(),
    ).toBe(200);
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`${theme} ${width} recorded evidence, source policy and private checkpoint`, async ({
      browser,
    }) => {
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
      const label = `${theme}-${width}`;
      try {
        await login(owner, 'owner');
        await login(viewer, 'viewer');
        await turnOff(owner);
        await turnOff(viewer);
        await owner.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await viewer.addInitScript((t) => localStorage.setItem('theme', t), theme);
        const created = await owner.request.post(`${api}/workspaces/${workspace}/documents`, {
          data: { title: `Digest source ${label}` },
        });
        expect(created.status()).toBe(201);
        const doc: { id: string } = await created.json();
        const hiddenResult = await owner.request.post(`${api}/workspaces/${workspace}/documents`, {
          data: { title: `Withdrawn source ${label}` },
        });
        expect(hiddenResult.status()).toBe(201);
        const hidden: { id: string } = await hiddenResult.json();
        expect((await owner.request.delete(`${api}/documents/${hidden.id}`)).status()).toBe(200);
        const snippetResult = await owner.request.post(`${api}/workspaces/${workspace}/snippets`, {
          data: {
            title: `Digest snippet ${label}`,
            code: 'const answer = 42;',
            language: 'typescript',
          },
        });
        expect(snippetResult.status()).toBe(201);
        const snippet: { id: string } = await snippetResult.json();
        const page = await owner.newPage();
        let release = () => {};
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        await owner.route(`**/api/v2/workspaces/${workspace}/digest/preferences`, async (route) => {
          await barrier;
          await route.continue();
        });
        await page.goto(`/workspace/${workspace}/digest`);
        await expect(page.getByRole('status', { name: 'Loading async digest' })).toBeVisible();
        await capture(page, `${label}-loading`);
        release();
        await owner.unrouteAll({ behavior: 'wait' });
        await expect(page.getByRole('button', { name: 'Enable my digest' })).toBeVisible();
        await capture(page, `${label}-off`);
        await page.getByRole('button', { name: 'Enable my digest' }).focus();
        await page.keyboard.press('Enter');
        const message = `created document "Digest source ${label}"`;
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(
          page.getByText(`created document "Withdrawn source ${label}"`, { exact: true }),
        ).toHaveCount(0);
        const itemsResponse = await owner.request.get(`${endpoint}/items`);
        expect(itemsResponse.status()).toBe(200);
        const digest: { items: { activityId: string; message: string; source: { id: string } }[] } =
          await itemsResponse.json();
        const activitiesResponse = await owner.request.get(
          `${api}/workspaces/${workspace}/activities`,
        );
        expect(activitiesResponse.status()).toBe(200);
        const recorded: { id: string; message: string }[] = await activitiesResponse.json();
        for (const item of digest.items)
          expect(
            item.message === recorded.find((event) => event.id === item.activityId)?.message,
          ).toBe(true);
        const event = digest.items.find((item) => item.source.id === doc.id);
        expect(Boolean(event)).toBe(true);
        if (!event) throw new Error('Source event not recorded');
        const windowSummary = page.getByText('Window (UTC)', { exact: true });
        await windowSummary.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-async-digest] details')).toHaveAttribute('open', '');
        await expect(page.locator('[data-async-digest] details p')).toContainText('through');
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-async-digest] details')).not.toHaveAttribute('open', '');
        await capture(page, `${label}-events`);
        const row = page
          .getByRole('listitem')
          .filter({ has: page.getByText(message, { exact: true }) });
        await row.getByRole('link', { name: 'View recorded source' }).click();
        await expect(page.getByRole('heading', { name: 'Recorded activity source' })).toBeVisible();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open document' })).toHaveAttribute(
          'href',
          `/workspace/${workspace}/docs/${doc.id}`,
        );
        await capture(page, `${label}-source`);
        await page.getByRole('link', { name: 'Back to digest' }).click();
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        const viewerPage = await viewer.newPage();
        await viewerPage.goto(`/workspace/${workspace}/digest`);
        await viewerPage.getByRole('button', { name: 'Enable my digest' }).click();
        await expect(viewerPage.getByText(message, { exact: true })).toBeVisible();
        await capture(viewerPage, `${label}-viewer`);
        await page.getByRole('button', { name: 'Mark through this event as seen' }).hover();
        await page.getByRole('button', { name: 'Mark through this event as seen' }).click();
        await expect(
          page.getByText('No eligible events in this window', { exact: true }),
        ).toBeVisible();
        await capture(page, `${label}-seen-empty`);
        await viewerPage.getByRole('button', { name: 'Refresh digest' }).click();
        await expect(viewerPage.getByText(message, { exact: true })).toBeVisible();
        expect(
          (
            await viewer.request.put(`${endpoint}/preferences`, {
              data: { enabled: false, expectedRevision: 0, userId: 'another-user' },
            })
          ).status(),
        ).toBe(400);
        expect((await owner.request.delete(`${api}/documents/${doc.id}`)).status()).toBe(200);
        await page.goto(`/workspace/${workspace}/digest/activity/${event.activityId}`);
        await expect(
          page.getByRole('alert').filter({ hasText: 'recorded source is unavailable' }),
        ).toBeVisible();
        await capture(page, `${label}-source-unavailable`);
        await page.getByRole('link', { name: 'Back to digest' }).click();
        await page.getByRole('button', { name: 'Turn off my digest' }).click();
        await expect(page.getByRole('button', { name: 'Enable my digest' })).toBeVisible();
        await owner.route(`**/api/v2/workspaces/${workspace}/digest/preferences`, (route) =>
          route.abort(),
        );
        await page.getByRole('button', { name: 'Refresh digest' }).click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'Digest unavailable' }),
        ).toBeVisible();
        await capture(page, `${label}-error`);
        await owner.unrouteAll({ behavior: 'wait' });
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByRole('button', { name: 'Enable my digest' })).toBeVisible();
        await turnOff(viewer);
        expect((await owner.request.delete(`${api}/snippets/${snippet.id}`)).status()).toBe(200);
      } finally {
        await owner.close();
        await viewer.close();
      }
    });
