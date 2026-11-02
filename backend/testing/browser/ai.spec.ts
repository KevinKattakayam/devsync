import { test, expect } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`${theme} ${width} AI transport fixture labels, references and partial failure`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
        const created = await context.request.post(
          'http://127.0.0.1:5501/api/workspaces/devsync-sample/documents',
          { data: { title: 'AI transport fixture — not a provider evaluation' } },
        );
        expect(created.status()).toBe(201);
        const { id }: { id: string } = await created.json();
        const page = await context.newPage();
        await page.goto(`/workspace/devsync-sample/docs/${id}`);
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
        let failure = false;
        await context.route('**/api/v3/ai/complete', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: failure
              ? 'data: {"content":"Partial transport fixture"}\n\ndata: {"error":"Private provider detail"}\n\n'
              : 'data: {"sources":[{"type":"document","title":"Welcome","score":1}]}\n\ndata: {"content":"Transport fixture — not a model answer. See [1]."}\n\ndata: {"done":true}\n\n',
          }),
        );
        async function generate() {
          await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
          await page
            .getByRole('textbox', { name: 'Your prompt' })
            .fill('Transport fixture request');
          await page.getByRole('button', { name: 'Generate', exact: true }).click();
        }
        const output = resolve(
          __dirname,
          '../../../docs/ui/after/ai',
          process.env.E2E_AI_PASS || 'initial',
        );
        await mkdir(output, { recursive: true });
        async function capture(state: string) {
          await page.getByRole('region', { name: 'AI draft' }).scrollIntoViewIfNeeded();
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
          expect(result.violations.map((v) => v.id)).toEqual([]);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        }
        await generate();
        await expect(
          page.getByRole('button', { name: 'Insert into document', exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole('heading', { name: 'AI-generated draft · Custom prompt' }),
        ).toBeVisible();
        await expect(page.getByText(/\[1\] Welcome/)).toBeVisible();
        await capture('complete-fixture');
        await page.getByRole('button', { name: 'Insert into document', exact: true }).click();
        await expect(page.locator('.ProseMirror')).toContainText('AI-generated');
        await expect(page.locator('.ProseMirror')).toContainText('[1] document: Welcome');
        failure = true;
        await generate();
        await expect(
          page.getByRole('alert').filter({ hasText: 'AI could not finish.' }),
        ).toContainText('partial output cannot be applied');
        await expect(
          page.getByRole('button', { name: 'Insert into document', exact: true }),
        ).toBeDisabled();
        await expect(page.getByText('Private provider detail', { exact: true })).toHaveCount(0);
        await capture('error-fixture');
      } finally {
        await context.close();
      }
    });
