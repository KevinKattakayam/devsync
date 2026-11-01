import { test, expect } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';
const api = 'http://127.0.0.1:5501/api';
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390])
    test(`${theme} ${width} keyboard move and drawer`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
        const target = await context.request.post(
          `${api}/tasks/boards/devsync-sample-board/columns`,
          { data: { name: `Keyboard target ${theme} ${width}` } },
        );
        expect(target.ok()).toBe(true);
        const { id }: { id: string } = await target.json();
        const page = await context.newPage();
        await page.goto('/workspace/devsync-sample/kanban');
        const move = page.getByRole('combobox', { name: 'Move Review workspace permissions' });
        await expect(move).toBeVisible();
        const root = resolve(
          __dirname,
          '../../../docs/ui/after/kanban',
          process.env.E2E_KANBAN_PASS || 'initial',
        );
        await mkdir(root, { recursive: true });
        async function capture(state: string) {
          await page.addScriptTag({ content: axe.source });
          const result = await page.evaluate(() =>
            window.axe.run(document, {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
            }),
          );
          await writeFile(
            resolve(root, `${theme}-${width}-${state}.json`),
            JSON.stringify(
              { violations: result.violations, incomplete: result.incomplete },
              null,
              2,
            ),
          );
          await page.screenshot({
            path: resolve(root, `${theme}-${width}-${state}.png`),
            fullPage: true,
            animations: 'disabled',
          });
          expect(result.violations.map((v) => v.id)).toEqual([]);
        }
        await move.scrollIntoViewIfNeeded();
        await capture('board');
        await move.focus();
        await page.keyboard.press('Enter');
        await expect(
          page.getByRole('option', { name: `Keyboard target ${theme} ${width}`, exact: true }),
        ).toBeVisible();
        await page.keyboard.press('End');
        await expect(
          page.getByRole('option', { name: `Keyboard target ${theme} ${width}`, exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Task moved', { exact: true })).toBeVisible();
        const data: { columns: { id: string; tasks: { id: string }[] }[] }[] = await (
          await context.request.get(`${api}/workspaces/devsync-sample/boards`)
        ).json();
        expect(
          data[0].columns
            .find((c) => c.id === id)
            ?.tasks.some((t) => t.id === 'devsync-sample-task'),
        ).toBe(true);
        await page
          .getByRole('button', { name: 'Review workspace permissions', exact: true })
          .click();
        await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible();
        await capture('drawer');
        await page.keyboard.press('Escape');
      } finally {
        await context.close();
      }
    });
test('viewer cannot move or edit snippets and foreign destinations reject', async ({ browser }) => {
  const viewer = await browser.newContext(),
    owner = await browser.newContext();
  try {
    await login(viewer, 'viewer');
    await login(owner, 'owner');
    const page = await viewer.newPage();
    await page.goto('/workspace/devsync-sample/kanban');
    await expect(page.getByText(/tasks · Read only/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Move Review/ })).toHaveCount(0);
    expect(
      (
        await viewer.request.patch(`${api}/tasks/tasks/devsync-sample-task/move`, {
          data: { columnId: 'devsync-sample-column', position: 0 },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await viewer.request.patch(`${api}/snippets/devsync-sample-snippet`, {
          data: { title: 'Forbidden' },
        })
      ).status(),
    ).toBe(403);
    const created = await owner.request.post(`${api}/workspaces`, {
      data: { name: 'Foreign board fixture' },
    });
    const { id }: { id: string } = await created.json();
    const boards: { columns: { id: string }[] }[] = await (
      await owner.request.get(`${api}/workspaces/${id}/boards`)
    ).json();
    const foreign = boards[0].columns[0].id;
    expect(
      (
        await owner.request.patch(`${api}/tasks/tasks/devsync-sample-task/move`, {
          data: { columnId: foreign, position: 0 },
        })
      ).ok(),
    ).toBe(false);
  } finally {
    await viewer.close();
    await owner.close();
  }
});
