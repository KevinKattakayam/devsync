# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quality.spec.ts >> quality fixes dark 390
- Location: testing/browser/quality.spec.ts:8:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "http://127.0.0.1:3001/login"
Received: "http://localhost:3001/login"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import axe from '../../../frontend/node_modules/axe-core';
  3  | import { mkdir, writeFile } from 'fs/promises';
  4  | import { resolve } from 'path';
  5  | import { login } from './identities';
  6  | for (const theme of ['dark', 'light'] as const)
  7  |   for (const width of [1440, 390])
  8  |     test(`quality fixes ${theme} ${width}`, async ({ browser }) => {
  9  |       const context = await browser.newContext({
  10 |         viewport: { width, height: 1000 },
  11 |         colorScheme: theme,
  12 |         reducedMotion: 'reduce',
  13 |       });
  14 |       try {
  15 |         const reset = await context.request.get(
  16 |           '/api/auth/reset?redirect=https%3A%2F%2Fattacker.invalid',
  17 |           { maxRedirects: 0 },
  18 |         );
  19 |         expect(reset.status()).toBe(307);
> 20 |         expect(reset.headers().location).toBe('http://127.0.0.1:3001/login');
     |                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  21 |         await login(context, 'owner');
  22 |         await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
  23 |         const page = await context.newPage();
  24 |         const output = resolve(__dirname, '../../../docs/quality/browser');
  25 |         await mkdir(output, { recursive: true });
  26 |         for (const state of ['billing', 'overview'] as const) {
  27 |           await page.goto(state === 'billing' ? '/settings/billing' : '/workspace/devsync-sample');
  28 |           await expect(
  29 |             page.getByRole('heading', {
  30 |               name: state === 'billing' ? 'Subscription & billing' : 'Integration status',
  31 |               exact: true,
  32 |             }),
  33 |           ).toBeVisible();
  34 |           await expect(
  35 |             page.getByText(/Active Enterprise Plan|3 Daemon Workers Active/),
  36 |           ).toHaveCount(0);
  37 |           if (!(await page.evaluate(() => !!window.axe)))
  38 |             await page.addScriptTag({ content: axe.source });
  39 |           const result = await page.evaluate(() =>
  40 |             window.axe.run(document, {
  41 |               runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  42 |             }),
  43 |           );
  44 |           await writeFile(
  45 |             resolve(output, `${theme}-${width}-${state}.json`),
  46 |             JSON.stringify(
  47 |               { violations: result.violations, incomplete: result.incomplete },
  48 |               null,
  49 |               2,
  50 |             ),
  51 |           );
  52 |           await page.screenshot({
  53 |             path: resolve(output, `${theme}-${width}-${state}.png`),
  54 |             fullPage: true,
  55 |             animations: 'disabled',
  56 |           });
  57 |           expect(result.violations.map((item) => item.id)).toEqual([]);
  58 |           expect(
  59 |             await page.evaluate(() => document.documentElement.scrollWidth),
  60 |           ).toBeLessThanOrEqual(width);
  61 |         }
  62 |       } finally {
  63 |         await context.close();
  64 |       }
  65 |     });
  66 | 
```