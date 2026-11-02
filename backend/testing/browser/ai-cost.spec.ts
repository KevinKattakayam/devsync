import { test, expect, type Page } from '@playwright/test';
import Redis from 'ioredis';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { AiQuota } from '../../src/services/ai-quota';
import { login } from './identities';
const api = 'http://127.0.0.1:5501/api';
const workspaceId = 'devsync-sample';
const output = resolve(
  __dirname,
  '../../../docs/ui/after/ai/cost-safety',
  process.env.E2E_AI_COST_PASS || 'initial',
);
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axe.source });
  const report = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      width: innerWidth,
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
    `${name}: ${report.violations.length} axe violations, ${report.incomplete.length} incomplete`,
  );
  expect(report.violations).toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.width);
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`${theme} ${width} real usage authority, refund and quota rejection`, async ({
      browser,
    }) => {
      test.setTimeout(120000);
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
      const redis = new Redis(process.env.REDIS_URL!);
      try {
        // Isolated operator-owned admission fixture, not a provider call or model evaluation.
        const keys = await redis.keys('aiq:*');
        if (keys.length) await redis.del(...keys);
        await login(owner, 'owner');
        await login(viewer, 'viewer');
        await owner.addInitScript((value) => localStorage.setItem('theme', value), theme);
        await viewer.addInitScript((value) => localStorage.setItem('theme', value), theme);
        const usage = `${api}/v3/ai/usage?workspaceId=${workspaceId}`;
        const missing = await owner.request.post(`${api}/v3/ai/complete`, {
          data: { workspaceId, prompt: 'Unavailable-provider fixture' },
        });
        expect(missing.status()).toBe(503);
        await expect
          .poll(
            async () =>
              ((await (await owner.request.get(usage)).json()) as { user: { daily: number } }).user
                .daily,
          )
          .toBe(0);
        const actor: { id: string } = await (await owner.request.get(`${api}/auth/me`)).json();
        const quota = new AiQuota(redis);
        await (
          await quota.acquire(actor.id, workspaceId)
        )();
        const personal = await owner.request.get(usage);
        expect(personal.status()).toBe(200);
        expect(personal.headers()['cache-control']).toBe('no-store');
        expect(await personal.json()).toMatchObject({
          user: { daily: 1, dailyLimit: 1 },
          workspace: { daily: 1 },
        });
        const created = await owner.request.post(`${api}/workspaces`, {
          data: { name: 'AI authority fixture' },
        });
        expect(created.status()).toBe(201);
        const foreign: { id: string } = await created.json();
        expect(
          (await viewer.request.get(`${api}/v3/ai/usage?workspaceId=${foreign.id}`)).status(),
        ).toBe(403);
        expect(
          await (await owner.request.get(`${api}/v3/ai/usage?workspaceId=${foreign.id}`)).json(),
        ).toMatchObject({ user: { daily: 1 }, workspace: { daily: 0 } });
        const page = await owner.newPage();
        await page.goto(`/workspace/${workspaceId}/settings`);
        const section = page.getByRole('region', { name: 'AI usage', exact: true });
        await expect(section.getByText('1 / 1 today', { exact: false })).toBeVisible();
        await expect(section.getByText('Daily reset / monthly reset (UTC)')).toBeVisible();
        await section.getByRole('button', { name: 'Refresh AI usage' }).focus();
        await page.keyboard.press('Enter');
        await capture(page, `${theme}-${width}-owner-usage`);
        const viewerPage = await viewer.newPage();
        await viewerPage.goto(`/workspace/${workspaceId}/settings`);
        await expect(
          viewerPage
            .getByRole('region', { name: 'AI usage' })
            .getByText('0 / 1 today', { exact: false }),
        ).toBeVisible();
        await capture(viewerPage, `${theme}-${width}-viewer-usage`);
        const document = await owner.request.post(`${api}/workspaces/${workspaceId}/documents`, {
          data: { title: 'Quota admission fixture — no model output' },
        });
        expect(document.status()).toBe(201);
        const doc: { id: string } = await document.json();
        await page.goto(`/workspace/${workspaceId}/docs/${doc.id}`);
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
        await expect(
          page.getByRole('group', { name: 'Document tools', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
        await page
          .getByRole('textbox', { name: 'Your prompt' })
          .fill('Quota fixture — must not call a provider');
        const response = page.waitForResponse(
          (value) =>
            value.url().endsWith('/api/v3/ai/complete') && value.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Generate', exact: true }).click();
        const blocked = await response;
        expect(blocked.status()).toBe(429);
        expect(await blocked.json()).toMatchObject({
          code: 'RATE_LIMITED',
          limit: { type: 'AI_QUOTA_EXCEEDED', scope: 'user', period: 'daily' },
        });
        expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
        await expect(
          page.getByRole('alert').filter({ hasText: 'AI request limit reached' }),
        ).toContainText('Reset or retry by');
        await expect(
          page.getByRole('button', { name: 'Insert into document', exact: true }),
        ).toHaveCount(0);
        await capture(page, `${theme}-${width}-quota-exceeded`);
      } finally {
        await redis.quit();
        await owner.close();
        await viewer.close();
      }
    });
