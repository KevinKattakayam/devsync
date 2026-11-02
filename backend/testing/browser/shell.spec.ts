import { test, expect, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';

declare global {
  interface Window {
    axe: typeof axe;
  }
}
const workspace = 'devsync-sample';
const doc = 'devsync-sample-doc';
const pass =
  process.env.E2E_QUALITY || process.env.E2E_SHELL_PASS === 'final' ? 'final' : 'initial';
const output = process.env.E2E_SHELL_OUTPUT
  ? resolve(__dirname, '../../..', process.env.E2E_SHELL_OUTPUT)
  : process.env.E2E_QUALITY
    ? resolve(__dirname, '../../../docs/quality/shell')
    : resolve(__dirname, '../../../docs/ui/after/shell', pass);
const reports: {
  theme: string;
  width: number;
  state: string;
  violations: axe.Result[];
  incomplete: axe.Result[];
}[] = [];
const measurements: Record<string, unknown>[] = [];

test.beforeAll(async ({ browser }) => {
  await mkdir(output, { recursive: true });
  const context = await browser.newContext();
  try {
    await login(context, 'owner');
    const rootsResponse = await context.request.get(
      `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
    );
    expect(rootsResponse.ok()).toBe(true);
    const roots: {
      id: string;
      children?: { id: string; title: string; children?: { title: string }[] }[];
    }[] = await rootsResponse.json();
    let child = roots
      .find((item) => item.id === doc)
      ?.children?.find((item) => item.title === 'Interface guidelines');
    if (!child) {
      const response = await context.request.post(
        `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
        { data: { title: 'Interface guidelines', parentId: doc } },
      );
      expect(response.status()).toBe(201);
      child = await response.json();
    }
    if (!child) throw new Error('Nested document setup failed');
    if (!child.children?.some((item) => item.title === 'Keyboard interactions')) {
      const response = await context.request.post(
        `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
        { data: { title: 'Keyboard interactions', parentId: child.id } },
      );
      expect(response.status()).toBe(201);
    }
  } finally {
    await context.close();
  }
});
test.afterAll(async () => {
  const files = (await readdir(output)).filter((file) => /^axe-(dark|light)-\d+\.json$/.test(file));
  const allReports = (
    await Promise.all(
      files.map(
        async (file) => JSON.parse(await readFile(resolve(output, file), 'utf8')) as typeof reports,
      ),
    )
  ).flat();
  await writeFile(resolve(output, 'axe.json'), JSON.stringify(allReports, null, 2));
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
});
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator('.ui-floating:visible, .ui-dialog:visible, .ui-drawer:visible')
    .evaluateAll((elements) =>
      Promise.all(
        elements.flatMap((element) =>
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        ),
      ),
    );
}
async function noPageOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    main: document.querySelector('.shell-main')?.clientWidth,
    scroll: document.querySelector('.shell-main')?.scrollWidth,
  }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport);
  if (bounds.main && bounds.scroll)
    expect(bounds.scroll, `Horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(
      bounds.main + 1,
    );
  return bounds;
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390]) {
    test(`${theme} ${width} shell states, keyboard access and visual baseline`, async ({
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
        const page = await context.newPage();
        const transport: { event: string; elapsed: number }[] = [];
        const started = Date.now();
        page.on('websocket', (socket) => {
          if (!socket.url().includes('/yjs')) return;
          const record = (event: string) => {
            if (transport.length < 200) transport.push({ event, elapsed: Date.now() - started });
          };
          record('created');
          socket.on('framesent', () => record('sent'));
          socket.on('framereceived', () => record('received'));
          socket.on('close', () => record('closed'));
          socket.on('socketerror', () => record('error'));
        });
        async function recordState(stage: string) {
          const state = await page.evaluate(() => ({
            saved: Array.from(document.querySelectorAll('[role="status"]')).some(
              (node) => node.textContent === 'Saved',
            ),
            offline: Array.from(document.querySelectorAll('[role="status"]')).some((node) =>
              node.textContent?.includes('Offline (Saving Locally)'),
            ),
            editorCount: document.querySelectorAll('.ProseMirror').length,
            editable: document.querySelector('.ProseMirror')?.getAttribute('contenteditable'),
            routeHeight: document.querySelector('#route-content')?.getBoundingClientRect().height,
            animations: Array.from(
              document.querySelectorAll('.ui-floating, .ui-dialog, .ui-drawer'),
            ).flatMap((element) =>
              element.getAnimations().map((animation) => ({
                hasLayoutRect: element.getClientRects().length > 0,
                state: animation.playState,
                pending: animation.pending,
              })),
            ),
          }));
          await writeFile(
            resolve(output, `diagnostic-${theme}-${width}-${stage}.json`),
            JSON.stringify({ elapsed: Date.now() - started, ...state, transport }, null, 2),
          );
        }
        await page.goto(`/workspace/${workspace}/docs/${doc}`);
        await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
        // Write permission and Socket.IO presence do not prove the CRDT handshake/ack completed.
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await expect(
          page.getByRole('status').filter({ hasText: 'Offline (Saving Locally)' }),
        ).toHaveCount(0);
        await expect(page.getByLabel('Server connected', { exact: true })).toBeAttached();
        await expect(
          page.getByRole('button', {
            name: 'Switch workspace: Sample workspace',
            includeHidden: true,
          }),
        ).toBeAttached();
        await page.addScriptTag({ content: axe.source });
        async function capture(state: string) {
          await recordState(`${state}-before-settle`);
          await settle(page);
          await recordState(`${state}-before-axe`);
          const result = await page.evaluate(async () => {
            const report = await window.axe.run(
              {
                include: [
                  ['[data-shell-region], [role="dialog"], [role="menu"], [role="listbox"]'],
                ],
              },
              { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
            );
            return { violations: report.violations, incomplete: report.incomplete };
          });
          await recordState(`${state}-after-axe`);
          await expect(
            page
              .getByRole('status', { includeHidden: true })
              .filter({ hasText: 'Offline (Saving Locally)' }),
          ).toHaveCount(0);
          reports.push({ theme, width, state, ...result });
          await writeFile(
            resolve(output, `axe-${theme}-${width}.json`),
            JSON.stringify(
              reports.filter((item) => item.theme === theme && item.width === width),
              null,
              2,
            ),
          );
          console.log(
            `${theme} ${width} ${state}: axe ${result.violations.length} violations, ${result.incomplete.length} incomplete`,
          );
          await page.screenshot({
            path: resolve(output, `${theme}-${width}-${state}.png`),
            fullPage: false,
            animations: 'disabled',
          });
          const bounds = await noPageOverflow(page);
          measurements.push({ theme, width, state, ...bounds });
          await writeFile(
            resolve(output, `bounds-${theme}-${width}.json`),
            JSON.stringify(
              measurements.filter((item) => item.theme === theme && item.width === width),
              null,
              2,
            ),
          );
          expect(
            result.violations.map(
              (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
            ),
          ).toEqual([]);
          if (pass === 'final')
            // Keep failures fatal to the test, but collect every state for image-by-image review.
            await expect.soft(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
              animations: 'disabled',
              mask: [page.locator('#route-content')],
              maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
              maxDiffPixelRatio: 0.002,
            });
        }
        const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
        expect(titleBounds?.width).toBeGreaterThan(width < 768 ? 250 : 500);
        measurements.push({ theme, width, state: 'title', bounds: titleBounds });
        await capture('default');
        const trigger = page.getByRole('button', { name: 'Search and commands', exact: true });
        await trigger.focus();
        await page.keyboard.press('Control+k');
        await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
        await capture('commands');
        await page.getByRole('combobox', { name: 'Search commands' }).fill('unmatched-command');
        await capture('commands-empty');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await page.getByLabel('Document title', { exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        // ? must type in editors, never steal focus; avoid changing persisted seed title.
        await page.keyboard.press('Shift+/');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.keyboard.press('Backspace');
        await trigger.focus();
        await page.keyboard.press('?');
        await capture('help');
        await page.keyboard.press('Tab');
        const trapped = await page.evaluate(
          () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
        );
        expect(trapped).toBe(true);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
        await capture('focus');
        await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
        await page.getByRole('button', { name: 'Sample owner', exact: true }).click();
        await capture('user-menu');
        await page.keyboard.press('Escape');
        if (width >= 768) {
          await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
          await capture('workspace-menu');
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
          await page.getByRole('button', { name: 'Expand Interface guidelines' }).focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('link', { name: 'Keyboard interactions' })).toBeVisible();
          await capture('document-tree');
          await page.getByRole('button', { name: 'Collapse sidebar' }).focus();
          await page.keyboard.press('Enter');
          await capture('collapsed');
          await page.getByRole('button', { name: 'Expand sidebar' }).click();
        } else {
          const mobileTrigger = page.getByRole('button', { name: 'Open navigation' });
          await mobileTrigger.click();
          await capture('mobile-navigation');
          await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
          await page.getByRole('button', { name: 'Expand Interface guidelines' }).click();
          await capture('document-tree');
          await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
          await capture('workspace-menu');
          await page.keyboard.press('Escape');
          await page.keyboard.press('Escape');
          await expect(mobileTrigger).toBeFocused();
        }
        await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
        await capture('copilot');
        await page.keyboard.press('Escape');
      } finally {
        await context.close();
      }
    });
  }

test('360px route coverage and viewer commands retain read-only authority', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 900 },
    reducedMotion: 'reduce',
  });
  try {
    await login(context, 'viewer');
    const page = await context.newPage();
    for (const route of [
      '/dashboard',
      `/workspace/${workspace}`,
      `/workspace/${workspace}/docs`,
      `/workspace/${workspace}/docs/${doc}`,
      `/workspace/${workspace}/kanban`,
      `/workspace/${workspace}/snippets`,
      `/workspace/${workspace}/settings`,
      '/settings/billing',
    ]) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: 'Search and commands' })).toBeVisible();
      if (route.endsWith(`/${doc}`))
        await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
      else await page.locator('#route-content h1').waitFor();
      const bounds = await noPageOverflow(page);
      measurements.push({ route, width: 360, ...bounds });
    }
    await page.goto(`/workspace/${workspace}/docs/${doc}`);
    await expect(page.getByLabel('Document title', { exact: true })).toHaveAttribute(
      'readonly',
      '',
    );
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search commands' });
    await input.fill('Create new document');
    await expect(
      page.getByRole('status').filter({ hasText: 'No matching commands.' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    const response = await context.request.post(
      `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
      { data: { title: 'Denied viewer command' } },
    );
    expect(response.status()).toBe(403);
  } finally {
    await context.close();
  }
});

test('review prior gallery incomplete items by focus, relationships and computed color', async ({
  browser,
}) => {
  const reviews: Record<string, unknown>[] = [];
  for (const theme of ['dark', 'light'] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    try {
      await login(context, 'owner');
      await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
      const page = await context.newPage();
      await page.goto('/design-system');
      await expect(page.getByRole('heading', { name: 'Design system', exact: true })).toBeVisible();
      await page.addScriptTag({ content: axe.source });
      for (const label of ['Open dialog', 'Open drawer', 'Open popover', 'Open menu', 'Commands']) {
        const trigger = page.getByRole('button', {
          name: label === 'Commands' ? /^Commands/ : label,
          exact: label !== 'Commands',
        });
        await trigger.click();
        const overlay = page.locator('[role="dialog"], [role="menu"]').last();
        await expect(overlay).toBeVisible();
        await page.keyboard.press(label === 'Open menu' ? 'ArrowDown' : 'Tab');
        const focusInside = await overlay.evaluate((element) =>
          element.contains(document.activeElement),
        );
        if (label !== 'Open popover') {
          expect(focusInside).toBe(true);
          await page.locator('#design-main').focus();
          expect(
            await overlay.evaluate((element) => element.contains(document.activeElement)),
          ).toBe(true);
        }
        const colorSamples = await overlay.evaluate((root) =>
          Array.from(root.querySelectorAll('p, button, input, [role="option"], [role="menuitem"]'))
            .filter(
              (element) =>
                element.getClientRects().length &&
                !element.closest('[data-disabled], [aria-disabled="true"]'),
            )
            .map((element) => {
              const style = getComputedStyle(element);
              let parent: Element | null = element;
              let background = 'rgb(0, 0, 0)';
              while (parent) {
                const color = getComputedStyle(parent).backgroundColor;
                if (!color.endsWith(', 0)') && color !== 'transparent') {
                  background = color;
                  break;
                }
                parent = parent.parentElement;
              }
              return {
                text: element.textContent?.trim().slice(0, 80),
                foreground: style.color,
                background,
              };
            }),
        );
        for (const sample of colorSamples) {
          const luminance = (color: string) => {
            const values = (color.match(/[\d.]+/g) || [])
              .slice(0, 3)
              .map(Number)
              .map((value) => value / 255)
              .map((value) =>
                value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
              );
            return values.reduce(
              (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
              0,
            );
          };
          const [low, high] = [luminance(sample.foreground), luminance(sample.background)].sort(
            (a, b) => a - b,
          );
          expect(
            (high + 0.05) / (low + 0.05),
            `${theme} ${label}: ${sample.text}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        reviews.push({ theme, label, colorSamples });
        const report = await page.evaluate(async () => {
          const result = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          });
          return { violations: result.violations, incomplete: result.incomplete };
        });
        reviews.push({ theme, label, focusInside, ...report });
        expect(report.violations).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
      const findings = await page.evaluate(() => {
        const relationships = Array.from(document.querySelectorAll('[aria-controls]')).map(
          (element) => ({
            tag: element.tagName,
            name: element.getAttribute('aria-label'),
            expanded: element.getAttribute('aria-expanded'),
            targetExists: !!document.getElementById(element.getAttribute('aria-controls') || ''),
          }),
        );
        const color = getComputedStyle(document.documentElement);
        const palette = Object.fromEntries(
          [
            '--background',
            '--foreground',
            '--popover',
            '--muted-foreground',
            '--primary',
            '--primary-foreground',
          ].map((token) => [token, color.getPropertyValue(token).trim()]),
        );
        return { relationships, palette };
      });
      expect(
        findings.relationships.filter((item) => item.expanded === 'true' && !item.targetExists),
      ).toEqual([]);
      reviews.push({ theme, findings });
    } finally {
      await context.close();
    }
  }
  await writeFile(resolve(output, 'gallery-manual-review.json'), JSON.stringify(reviews, null, 2));
});

test('visual settling skips the pending animation inside a closed formatting disclosure', async ({
  page,
}) => {
  test.setTimeout(10000);
  // Synthetic DOM regression for the real editor's closed <details> control.
  await page.setContent(`
    <style>
      @keyframes enter { from { opacity: 0; } to { opacity: 1; } }
      .ui-floating { animation: enter 150ms ease-out; }
    </style>
    <details><summary>Formatting</summary><div class="ui-floating">Hidden formatting controls</div></details>
    <div class="ui-floating" aria-label="Visible overlay">Visible controls</div>
  `);
  await expect(page.getByText('Hidden formatting controls')).toBeHidden();
  await settle(page);
  await expect(page.getByLabel('Visible overlay')).toBeVisible();
  expect(
    await page
      .getByLabel('Visible overlay')
      .evaluate((element) =>
        element.getAnimations().every((animation) => animation.playState === 'finished'),
      ),
  ).toBe(true);
});
