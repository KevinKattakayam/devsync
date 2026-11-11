import { expect, test, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';

const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const output = resolve(__dirname, '../../../docs/ui/after/ai/phase14-grounded-assistant');

async function capture(page: Page, state: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>('.shell-main')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.addScriptTag({ content: axe.source });
  const report = await page.evaluate(async () => {
    const assistantDialog = document.querySelector('.shell-copilot');
    if (!assistantDialog) throw new Error('Assistant dialog is not mounted');
    const results = await window.axe.run(assistantDialog, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    return {
      violations: results.violations,
      incomplete: results.incomplete,
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await writeFile(resolve(output, `${state}.json`), JSON.stringify(report, null, 2));
  await page.screenshot({
    path: resolve(output, `${state}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  console.log(
    `${state}: ${report.violations.length} axe violations; ${report.incomplete.length} incomplete`,
  );
  expect(report.violations).toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport);
}

test('grounded assistant fixture covers cited preview, source navigation and recoverable failure', async ({
  browser,
}) => {
  test.setTimeout(240000);
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((scheme) => localStorage.setItem('theme', scheme), theme);
        const created = await context.request.post(`${api}/workspaces/${workspace}/documents`, {
          data: { title: `Grounded UI fixture ${theme} ${width}` },
        });
        expect(created.status()).toBe(201);
        const document: { id: string } = await created.json();
        let mode: 'preview' | 'unavailable' = 'preview';
        await context.route('**/api/v3/ai/grounded', (route) =>
          mode === 'preview'
            ? route.fulfill({
                status: 200,
                json: {
                  status: 'preview',
                  notice: 'Fixture excerpts are not verified truth.',
                  claims: [{ text: 'Fixture answer for layout only.', references: [1] }],
                  proposals: [
                    {
                      kind: 'task',
                      title: 'Review cited material',
                      description: 'A draft suggestion only.',
                      references: [1],
                    },
                  ],
                  sources: [
                    {
                      reference: 1,
                      type: 'document',
                      id: document.id,
                      title: `Grounded UI fixture ${theme} ${width}`,
                      indexedAt: '2026-11-10T10:00:00.000Z',
                    },
                  ],
                  latencyMs: 1,
                },
              })
            : route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } }),
        );
        await context.route('**/api/v2/workspaces/**/search/source**', (route) =>
          route.fulfill({
            status: 200,
            json: { results: [{ href: `/workspace/${workspace}/docs/${document.id}` }] },
          }),
        );
        const page = await context.newPage();
        await page.goto(`/workspace/${workspace}`);
        const copilotTrigger = page.getByRole('button', { name: 'AI Copilot', exact: true });
        await copilotTrigger.click();
        const dialog = page.getByRole('dialog', { name: 'DevSync Copilot' });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(copilotTrigger).toBeFocused();
        await copilotTrigger.click();
        await page.getByLabel('Your question or request').fill('Fixture request');
        const submit = page.getByRole('button', { name: 'Generate preview' });
        await page.getByLabel('Your question or request').focus();
        await page.keyboard.press('Tab');
        await expect(submit).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Fixture answer for layout only.')).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Open cited source 1:' }).first(),
        ).toBeVisible();
        await expect(page.getByText('Fixture excerpts are not verified truth.')).toBeVisible();
        const statePrefix = `${theme}-${width}`;
        await capture(page, `${statePrefix}-preview-fixture`);
        await page.getByRole('button', { name: 'Open cited source 1:' }).first().click();
        await expect(page).toHaveURL(new RegExp(`/workspace/${workspace}/docs/${document.id}$`));
        await page.goBack();
        await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
        mode = 'unavailable';
        await page.getByLabel('Your question or request').fill('Retry fixture request');
        await page.getByRole('button', { name: 'Generate preview' }).click();
        await expect(page.getByRole('alert')).toContainText('currently unavailable');
        await expect(page.getByRole('button', { name: 'Retry preview' })).toBeVisible();
        await expect(page.getByText('Fixture answer for layout only.')).toHaveCount(0);
        await capture(page, `${statePrefix}-unavailable-fixture`);
      } finally {
        await context.close();
      }
    }
  }
});

test('viewer receives the workspace permission error and cannot request a draft', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  try {
    await login(context, 'viewer');
    const denied = await context.request.post(`${api}/v3/ai/grounded`, {
      data: { workspaceId: workspace, prompt: 'Fixture question', purpose: 'meeting_tasks' },
    });
    expect(denied.status()).toBe(403);
    await context.route('**/api/v3/ai/grounded', (route) =>
      route.fulfill({ status: 403, json: { error: 'Fixture permission denial' } }),
    );
    const page = await context.newPage();
    await page.goto(`/workspace/${workspace}`);
    await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
    await page.getByLabel('What do you need?').selectOption('meeting_tasks');
    await page.getByLabel('Your question or request').fill('Create a task from this fixture');
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.getByRole('alert')).toContainText('do not have permission');
    await expect(page.getByText('Fixture permission denial')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
