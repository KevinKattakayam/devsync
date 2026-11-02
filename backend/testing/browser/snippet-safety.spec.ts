import { test, expect, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';
test.setTimeout(120000);
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const output = resolve(
  __dirname,
  '../../../docs/ui/after/snippet-safety',
  process.env.E2E_SNIPPET_SAFETY_PASS || 'initial',
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

for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`${theme} ${width} snippet redaction, edit and viewer boundaries`, async ({ browser }) => {
      const context = await browser.newContext({
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
        await login(context, 'owner');
        await login(viewer, 'viewer');
        await context.addInitScript((t) => localStorage.setItem('theme', t), theme);
        await viewer.addInitScript((t) => localStorage.setItem('theme', t), theme);
        const page = await context.newPage();
        let release = () => {};
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        await context.route(`**/api/workspaces/${workspace}/snippets`, async (route) => {
          await barrier;
          await route.continue();
        });
        await page.goto(`/workspace/${workspace}/snippets/safety`);
        await expect(page.getByRole('status', { name: 'Loading snippet safety' })).toBeVisible();
        await capture(page, `${label}-loading`);
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await expect(page.getByRole('button', { name: 'Review preflight' })).toBeVisible();
        if (width === 1440) {
          const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
          await expect(nav.locator('a[aria-current=page]')).toHaveCount(1);
          await expect(
            nav.getByRole('link', { name: 'Snippet safety', exact: true }),
          ).toHaveAttribute('aria-current', 'page');
        }
        await capture(page, `${label}-editor`);
        const title = `Preflight ${label}`;
        // Synthetic in-memory scanner input. No provider credential, trace, or raw-input screenshot.
        const synthetic = 'gh' + 'p_' + 'SyntheticFixture'.repeat(3);
        const original = {
          title,
          code: `const key = "${synthetic}";`,
          language: 'typescript',
          description: 'Synthetic preflight exercise',
        };
        await page.getByRole('textbox', { name: 'Snippet title' }).fill(title);
        await page.getByRole('textbox', { name: 'Code', exact: true }).fill(original.code);
        await page
          .getByRole('textbox', { name: 'Description', exact: true })
          .fill(original.description);
        await page.getByRole('button', { name: 'Review preflight' }).focus();
        await page.keyboard.press('Enter');
        const review = page.getByRole('region', { name: 'Preflight review' });
        await expect(review.getByText('[REDACTED:github-token]', { exact: true })).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Review the redacted result' }),
        ).toBeFocused();
        expect(
          (await page.getByRole('textbox', { name: 'Code', exact: true }).inputValue()).includes(
            synthetic,
          ),
        ).toBe(false);
        await review.getByRole('button', { name: 'Save redacted snippet' }).hover();
        await capture(page, `${label}-review`);
        const endpoint = `${api}/v2/workspaces/${workspace}/snippet-safety`;
        const before = await context.request.get(`${api}/workspaces/${workspace}/snippets`);
        const beforeRows: { title: string }[] = await before.json();
        expect(beforeRows.some((r) => r.title === title)).toBe(false);
        await review.getByRole('button', { name: 'Save redacted snippet' }).click();
        await expect(page.getByRole('button', { name: 'Review preflight' })).toBeVisible();
        const listed = await context.request.get(`${api}/workspaces/${workspace}/snippets`);
        const rows: { id: string; title: string; code: string; updatedAt: string }[] =
          await listed.json();
        const snippet = rows.find((r) => r.title === title);
        expect(Boolean(snippet)).toBe(true);
        if (!snippet) throw new Error('Reviewed snippet missing');
        expect(snippet.code.includes(synthetic)).toBe(false);
        const metadata = await context.request.get(`${endpoint}/findings`, {
          params: { snippetId: snippet.id },
        });
        expect(metadata.status()).toBe(200);
        expect((await metadata.text()).includes(synthetic)).toBe(false);
        await capture(page, `${label}-saved`);
        await page.getByRole('combobox', { name: 'Edit existing snippet' }).click();
        await page.getByRole('option', { name: title, exact: true }).press('Enter');
        await page.getByRole('textbox', { name: 'Code', exact: true }).fill('const value = 42;');
        await page.getByRole('button', { name: 'Review preflight' }).click();
        await expect(review.getByText(/No patterns detected/)).toBeVisible();
        await capture(page, `${label}-clean-review`);
        await review.getByRole('button', { name: 'Save redacted snippet' }).click();
        await expect(page.getByRole('button', { name: 'Review preflight' })).toBeVisible();
        const viewerPage = await viewer.newPage();
        await viewerPage.goto(`/workspace/${workspace}/snippets/safety`);
        await expect(viewerPage.getByText(/You have read-only access/)).toBeVisible();
        await expect(viewerPage.getByRole('button', { name: 'Review preflight' })).toHaveCount(0);
        await viewerPage.getByRole('combobox', { name: 'Snippet findings' }).click();
        await viewerPage.getByRole('option', { name: title, exact: true }).press('Enter');
        await expect(viewerPage.getByText(/No patterns detected/)).toBeVisible();
        await capture(viewerPage, `${label}-viewer`);
        expect(
          (await viewer.request.post(`${endpoint}/preflight`, { data: original })).status(),
        ).toBe(403);
        expect(
          (
            await viewer.request.post(`${endpoint}/save`, {
              data: { content: original, confirmRedaction: true },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.post(`${api}/workspaces/${workspace}/snippets`, {
              data: original,
            })
          ).status(),
        ).toBe(400);
        // Explicit network failure fixture; no fake business response or provider output.
        await page.getByRole('textbox', { name: 'Snippet title' }).fill(`Retry ${label}`);
        await page.getByRole('textbox', { name: 'Code', exact: true }).fill('const clean = 1;');
        await context.route(`**/api/v2/workspaces/${workspace}/snippet-safety/preflight`, (route) =>
          route.abort(),
        );
        await page.getByRole('button', { name: 'Review preflight' }).click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'Preflight unavailable' }),
        ).toBeVisible();
        await capture(page, `${label}-error`);
        await context.unrouteAll({ behavior: 'wait' });
        await page.getByRole('button', { name: 'Review preflight' }).click();
        await expect(review.getByRole('button', { name: 'Save redacted snippet' })).toBeVisible();
      } finally {
        await context.close();
        await viewer.close();
      }
    });
