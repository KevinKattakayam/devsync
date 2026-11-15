import { test, expect } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';
const api = 'http://127.0.0.1:5501/api';
test('large task fixture keeps the rendered list bounded while scrolling and using keyboard navigation', async ({
  browser,
}) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    try {
      await login(context, 'owner');
      const response = await context.request.get(`${api}/workspaces/devsync-sample/boards`);
      expect(response.ok()).toBeTruthy();
      const boards: {
        columns: { id: string; name: string; tasks: Record<string, unknown>[] }[];
      }[] = await response.json();
      const column = boards[0].columns[0];
      const template = boards[0].columns.flatMap((item) => item.tasks)[0];
      if (!template) throw new Error('Missing fixture task');
      column.tasks = Array.from({ length: 1000 }, (_, index) => ({
        ...template,
        id: `virtual-fixture-${index}`,
        columnId: column.id,
        title: `Virtual fixture task ${index}`,
        description:
          index === 0
            ? 'A long fixture description for variable-height task content '.repeat(8)
            : '',
      }));
      await context.route('**/workspaces/devsync-sample/boards*', (route) =>
        route.fulfill({ status: 200, json: boards }),
      );
      const page = await context.newPage();
      const started = Date.now();
      await page.goto('/workspace/devsync-sample/kanban');
      await expect(
        page.getByRole('button', { name: 'Virtual fixture task 0', exact: true }),
      ).toBeVisible();
      const elapsed = Date.now() - started;
      const list = page.getByRole('list', { name: `${column.name} task list` });
      const initialRows = await list.getByRole('listitem').count();
      const domNodes = await page.locator('*').count();
      expect(initialRows).toBeGreaterThan(0);
      expect(initialRows).toBeLessThan(40);
      const next = page.getByRole('button', { name: `Next tasks in ${column.name}` });
      await next.focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => page.evaluate(() => document.activeElement?.textContent))
        .toContain('Virtual fixture task');
      const focusedTask = await page.evaluate(() => document.activeElement?.textContent);
      const region = page.getByRole('region', { name: `${column.name} tasks` });
      await region.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        page.getByRole('button', { name: 'Virtual fixture task 999', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(focusedTask);
      await page.setViewportSize({ width: width === 1440 ? 1000 : 360, height: 700 });
      await expect(
        page.getByRole('button', { name: 'Virtual fixture task 999', exact: true }),
      ).toBeVisible();
      const finalRows = await list.getByRole('listitem').count();
      expect(finalRows).toBeLessThan(40);
      console.log(
        `virtual fixture: width=${width}, tasks=1000, initialRows=${initialRows}, finalRows=${finalRows}, pageNodes=${domNodes}, loadMs=${elapsed}`,
      );
    } finally {
      await context.close();
    }
  }
});
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
        const drawer = page.getByRole('dialog', { name: 'Task details' });
        await expect(drawer).toBeVisible();
        const drawerBounds = await drawer.boundingBox();
        expect(drawerBounds).not.toBeNull();
        if (drawerBounds) {
          if (width <= 390) expect(drawerBounds.width).toBeGreaterThanOrEqual(width - 40);
          else expect(drawerBounds.width).toBeGreaterThanOrEqual(470);
        }
        const priority = await page.getByLabel('Task priority').boundingBox();
        const dueDate = await page.getByLabel('Task due date').boundingBox();
        expect(priority).not.toBeNull();
        expect(dueDate).not.toBeNull();
        if (priority && dueDate) {
          if (width <= 390) {
            expect(dueDate.y).toBeGreaterThan(priority.y + priority.height);
          } else {
            expect(dueDate.y).toBe(priority.y);
          }
        }
        await capture('drawer');
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Review workspace permissions', exact: true }),
        ).toBeFocused();
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
