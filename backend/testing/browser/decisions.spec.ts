import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';
test.setTimeout(180000);
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const requestedPass = process.env.E2E_DECISIONS_PASS;
const pass =
  requestedPass && /^[a-z0-9][a-z0-9-]*$/i.test(requestedPass) ? requestedPass : 'initial';
const output = resolve(__dirname, '../../../docs/ui/after/decision-receipts', pass);
async function setFixtureTheme(context: import('@playwright/test').BrowserContext, theme: string) {
  await context.addInitScript((requestedTheme) => {
    // The context can also create opaque or third-party documents; only initialize the app origin.
    if (location.origin !== 'http://127.0.0.1:3001') return;
    localStorage.setItem('theme', requestedTheme);
  }, theme);
}
async function expectFixtureTheme(page: Page, theme: string) {
  await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));
}
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
    test(`${theme} ${width} decision lifecycle and viewer denial`, async ({ browser }) => {
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
        await setFixtureTheme(context, theme);
        await setFixtureTheme(viewer, theme);
        const sourceTitle = `Receipt source ${label}`;
        const created = await context.request.post(`${api}/workspaces/${workspace}/documents`, {
          data: { title: sourceTitle },
        });
        expect(created.status()).toBe(201);
        const document: { id: string } = await created.json();
        const page = await context.newPage();
        // Hold only the initial list to make the real loading skeleton deterministic.
        let release = () => {};
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        await context.route(`**/api/v2/workspaces/${workspace}/decisions`, async (route) => {
          if (route.request().method() === 'GET') await barrier;
          await route.continue();
        });
        await page.goto(`/workspace/${workspace}/decisions`);
        await expectFixtureTheme(page, theme);
        await expect(page.getByRole('status', { name: 'Loading decision receipts' })).toBeVisible();
        await capture(page, `${label}-loading`);
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await expect(page.getByRole('button', { name: 'New receipt' })).toBeVisible();
        await capture(page, `${label}-initial`);
        async function createReceipt(title: string) {
          await page.getByRole('button', { name: 'New receipt' }).click();
          const dialog = page.getByRole('dialog');
          if (title === `Decision ${label}`) {
            await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
            await page.keyboard.press('Tab');
            await expect(
              dialog.getByRole('textbox', { name: 'Find a source by title' }),
            ).toBeFocused();
            await page.keyboard.press('Shift+Tab');
            await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
          }
          await dialog.getByRole('textbox', { name: 'Find a source by title' }).fill(sourceTitle);
          await dialog.getByRole('button', { name: 'Find sources' }).click();
          await expect(dialog.getByRole('button', { name: 'Find sources' })).toBeEnabled();
          await dialog.getByRole('combobox', { name: 'Decision source' }).click();
          await page
            .getByRole('option', { name: `${sourceTitle} · document`, exact: true })
            .press('Enter');
          await dialog.getByRole('textbox', { name: 'Decision title' }).fill(title);
          await dialog
            .getByRole('textbox', { name: 'Rationale and tradeoffs' })
            .fill('Keep the tradeoff and its source together.');
          await expect(dialog.getByRole('textbox', { name: 'Source quote' })).toHaveValue(
            new RegExp(sourceTitle),
          );
          await expect(dialog.getByRole('button', { name: 'Save draft' })).toBeEnabled();
          if (title === `Decision ${label}`) await capture(page, `${label}-form`);
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await expect(dialog).not.toBeVisible();
          return page.getByRole('article', { name: title, exact: true });
        }
        const title = `Decision ${label}`;
        let article = await createReceipt(title);
        await expect(article.getByText('Draft', { exact: true })).toBeVisible();
        await article.getByRole('button', { name: 'Edit draft' }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(article.getByRole('button', { name: 'Edit draft' })).toBeFocused();
        await article.getByRole('button', { name: 'Edit draft' }).click();
        await page
          .getByRole('dialog')
          .getByRole('textbox', { name: 'Rationale and tradeoffs' })
          .fill('Edited rationale: keep a verifiable source.');
        await page.getByRole('dialog').getByRole('button', { name: 'Save draft' }).click();
        await expect(
          article.getByText('Edited rationale: keep a verifiable source.'),
        ).toBeVisible();
        await capture(page, `${label}-draft`);
        const viewerPage = await viewer.newPage();
        await viewerPage.goto(`/workspace/${workspace}/decisions`, {
          waitUntil: 'domcontentloaded',
        });
        await expectFixtureTheme(viewerPage, theme);
        await expect(viewerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
        await expect(viewerPage.getByRole('button', { name: 'New receipt' })).toHaveCount(0);
        await expect(viewerPage.getByRole('button', { name: 'Edit draft' })).toHaveCount(0);
        await capture(viewerPage, `${label}-viewer`);
        const recordsResponse = await context.request.get(
          `${api}/v2/workspaces/${workspace}/decisions`,
        );
        const records: {
          id: string;
          title: string;
          revision: number;
          sourceRevision: string;
          sourceId: string;
          sourceKind: string;
          excerpt: string;
          rationale: string;
        }[] = await recordsResponse.json();
        const receipt = records.find((r) => r.title === title);
        expect(receipt).toBeDefined();
        if (!receipt) throw new Error('Missing created receipt');
        const content = {
          title,
          rationale: receipt.rationale,
          sourceKind: receipt.sourceKind,
          sourceId: receipt.sourceId,
          sourceRevision: receipt.sourceRevision,
          excerpt: receipt.excerpt,
        };
        const endpoint = `${api}/v2/workspaces/${workspace}/decisions`;
        expect((await viewer.request.post(endpoint, { data: content })).status()).toBe(403);
        expect(
          (
            await viewer.request.patch(`${endpoint}/${receipt.id}`, {
              data: { ...content, revision: receipt.revision },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await viewer.request.delete(`${endpoint}/${receipt.id}`, {
              data: { revision: receipt.revision },
            })
          ).status(),
        ).toBe(403);
        await article.getByRole('button', { name: 'Accept decision' }).click();
        await capture(page, `${label}-accept-confirmation`);
        await page.getByRole('dialog').getByRole('button', { name: 'Confirm acceptance' }).click();
        await expect(article.getByText('Accepted', { exact: true })).toBeVisible();
        const linkedSource = article.getByRole('region', { name: 'Linked source' });
        await expect(
          linkedSource.getByRole('link', {
            name: `Open source document: ${sourceTitle}`,
          }),
        ).toHaveAttribute('href', `/workspace/${workspace}/docs/${document.id}`);
        await article.getByRole('button', { name: 'Load execution timeline' }).click();
        await article.getByLabel('Evidence type').selectOption('linked_task');
        await expect(
          article.getByRole('option', { name: 'Review workspace permissions' }),
        ).toBeAttached();
        await article
          .getByRole('combobox', { name: 'Task', exact: true })
          .selectOption({ label: 'Review workspace permissions' });
        await article.getByLabel('Evidence description').fill(`Task link ${label}`);
        await article.getByRole('button', { name: 'Record evidence' }).click();
        await expect(article.getByText(`Task link ${label}`, { exact: true })).toBeVisible();
        await expect(
          article.getByRole('link', { name: 'Open task board for Review workspace permissions' }),
        ).toHaveAttribute('href', `/workspace/${workspace}/kanban`);
        await capture(page, `${label}-connected-work`);
        const taskLink = article.getByRole('link', {
          name: 'Open task board for Review workspace permissions',
        });
        await taskLink.focus();
        await expect(taskLink).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`/workspace/${workspace}/kanban$`));
        await page.goto(`/workspace/${workspace}/decisions`);
        article = page.getByRole('article', { name: title, exact: true });
        // The viewer is already on this route; refresh its data without a second document navigation.
        await expect(viewerPage).toHaveURL(new RegExp(`/workspace/${workspace}/decisions$`));
        await viewerPage.getByRole('button', { name: 'Refresh receipts', exact: true }).click();
        const viewerCard = viewerPage.getByRole('article', { name: title, exact: true });
        await viewerCard.getByRole('button', { name: 'Load execution timeline' }).click();
        await expect(viewerCard.getByText(`Task link ${label}`, { exact: true })).toBeVisible();
        await expect(
          viewerCard.getByRole('link', {
            name: 'Open task board for Review workspace permissions',
          }),
        ).toBeVisible();
        await expect(viewerCard.getByRole('button', { name: 'Record evidence' })).toHaveCount(0);
        await capture(viewerPage, `${label}-connected-viewer`);
        const replacementTitle = `Replacement ${label}`;
        const replacement = await createReceipt(replacementTitle);
        await replacement.getByRole('button', { name: 'Accept decision' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Confirm acceptance' }).click();
        article = page.getByRole('article', { name: title, exact: true });
        await article.getByRole('button', { name: 'Supersede decision' }).click();
        await page.getByRole('combobox', { name: 'Replacement receipt' }).click();
        await page.getByRole('option', { name: replacementTitle, exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirm supersession' })
          .hover();
        await capture(page, `${label}-supersede-confirmation`);
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirm supersession' })
          .click();
        await expect(article.getByText('Superseded', { exact: true })).toBeVisible();
        await capture(page, `${label}-final`);
        const removable = await createReceipt(`Disposable ${label}`);
        await removable.getByRole('button', { name: 'Delete draft' }).click();
        await capture(page, `${label}-delete-confirmation`);
        await test.step('confirm draft deletion and observe the deleted row', async () => {
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Delete draft', exact: true })
            .click({ timeout: 15000 });
          await expect(removable).toHaveCount(0);
        });
        await test.step('delete the now-unreferenced source document', async () => {
          const response = await context.request.delete(`${api}/documents/${document.id}`, {
            timeout: 15000,
          });
          expect(response.ok()).toBe(true);
        });
        await test.step('refresh and observe the missing-source decision', async () => {
          await page.getByRole('button', { name: 'Refresh receipts' }).click({ timeout: 15000 });
          await expect(article).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Refresh receipts' })).toBeVisible();
        });
        // Honest unavailable state: explicit test-only network failure, no fabricated business data.
        await context.route(`**/api/v2/workspaces/${workspace}/decisions`, (route) =>
          route.abort(),
        );
        await page.getByRole('button', { name: 'Refresh receipts' }).click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'Decision receipts are unavailable' }),
        ).toBeVisible();
        await capture(page, `${label}-error`);
        await context.unrouteAll({ behavior: 'wait' });
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByRole('button', { name: 'New receipt' })).toBeVisible();
      } finally {
        await context.close();
        await viewer.close();
      }
    });
