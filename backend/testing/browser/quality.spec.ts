import { test, expect } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`quality fixes ${theme} ${width}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        const reset = await context.request.get(
          '/api/auth/reset?redirect=https%3A%2F%2Fattacker.invalid',
          { maxRedirects: 0 },
        );
        expect(reset.status()).toBe(307);
        expect(reset.headers().location).toBe('/login');
        await login(context, 'owner');
        await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
        const page = await context.newPage();
        const output = resolve(
          __dirname,
          '../../../docs/quality/browser',
          process.env.E2E_QUALITY_PASS || 'initial',
        );
        await mkdir(output, { recursive: true });
        for (const state of ['billing', 'overview'] as const) {
          await page.goto(state === 'billing' ? '/settings/billing' : '/workspace/devsync-sample');
          await expect(
            page.getByRole('heading', {
              name: state === 'billing' ? 'Subscription & billing' : 'Integration status',
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByText(/Active Enterprise Plan|3 Daemon Workers Active/),
          ).toHaveCount(0);
          if (!(await page.evaluate(() => !!window.axe)))
            await page.addScriptTag({ content: axe.source });
          const result = await page.evaluate(() =>
            window.axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
            }),
          );
          await writeFile(
            resolve(output, `${theme}-${width}-${state}.json`),
            JSON.stringify(
              { violations: result.violations, incomplete: result.incomplete },
              null,
              2,
            ),
          );
          await page.screenshot({
            path: resolve(output, `${theme}-${width}-${state}.png`),
            fullPage: true,
            animations: 'disabled',
          });
          expect(result.violations.map((item) => item.id)).toEqual([]);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        }
      } finally {
        await context.close();
      }
    });
