# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shell.spec.ts >> dark 390 shell states, keyboard access and visual baseline
- Location: testing/browser/shell.spec.ts:104:9

# Error details

```
Error: locator.evaluateAll: AbortError: The user aborted a request.
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import axe from '../../../frontend/node_modules/axe-core';
  3   | import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
  4   | import { resolve } from 'node:path';
  5   | import { login } from './identities';
  6   | 
  7   | declare global {
  8   |   interface Window {
  9   |     axe: typeof axe;
  10  |   }
  11  | }
  12  | const workspace = 'devsync-sample';
  13  | const doc = 'devsync-sample-doc';
  14  | const pass =
  15  |   process.env.E2E_QUALITY || process.env.E2E_SHELL_PASS === 'final' ? 'final' : 'initial';
  16  | const output = process.env.E2E_QUALITY
  17  |   ? resolve(__dirname, '../../../docs/quality/shell')
  18  |   : resolve(__dirname, '../../../docs/ui/after/shell', pass);
  19  | const reports: {
  20  |   theme: string;
  21  |   width: number;
  22  |   state: string;
  23  |   violations: axe.Result[];
  24  |   incomplete: axe.Result[];
  25  | }[] = [];
  26  | const measurements: Record<string, unknown>[] = [];
  27  | 
  28  | test.beforeAll(async ({ browser }) => {
  29  |   await mkdir(output, { recursive: true });
  30  |   const context = await browser.newContext();
  31  |   try {
  32  |     await login(context, 'owner');
  33  |     const rootsResponse = await context.request.get(
  34  |       `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
  35  |     );
  36  |     expect(rootsResponse.ok()).toBe(true);
  37  |     const roots: {
  38  |       id: string;
  39  |       children?: { id: string; title: string; children?: { title: string }[] }[];
  40  |     }[] = await rootsResponse.json();
  41  |     let child = roots
  42  |       .find((item) => item.id === doc)
  43  |       ?.children?.find((item) => item.title === 'Interface guidelines');
  44  |     if (!child) {
  45  |       const response = await context.request.post(
  46  |         `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
  47  |         { data: { title: 'Interface guidelines', parentId: doc } },
  48  |       );
  49  |       expect(response.status()).toBe(201);
  50  |       child = await response.json();
  51  |     }
  52  |     if (!child) throw new Error('Nested document setup failed');
  53  |     if (!child.children?.some((item) => item.title === 'Keyboard interactions')) {
  54  |       const response = await context.request.post(
  55  |         `http://127.0.0.1:5501/api/workspaces/${workspace}/documents`,
  56  |         { data: { title: 'Keyboard interactions', parentId: child.id } },
  57  |       );
  58  |       expect(response.status()).toBe(201);
  59  |     }
  60  |   } finally {
  61  |     await context.close();
  62  |   }
  63  | });
  64  | test.afterAll(async () => {
  65  |   const files = (await readdir(output)).filter((file) => /^axe-(dark|light)-\d+\.json$/.test(file));
  66  |   const allReports = (
  67  |     await Promise.all(
  68  |       files.map(
  69  |         async (file) => JSON.parse(await readFile(resolve(output, file), 'utf8')) as typeof reports,
  70  |       ),
  71  |     )
  72  |   ).flat();
  73  |   await writeFile(resolve(output, 'axe.json'), JSON.stringify(allReports, null, 2));
  74  |   await writeFile(resolve(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  75  | });
  76  | async function settle(page: Page) {
  77  |   await page.evaluate(() => document.fonts.ready);
  78  |   await page
  79  |     .locator('.ui-floating, .ui-dialog, .ui-drawer')
> 80  |     .evaluateAll((elements) =>
      |      ^ Error: locator.evaluateAll: AbortError: The user aborted a request.
  81  |       Promise.all(
  82  |         elements.flatMap((element) =>
  83  |           element.getAnimations().map((animation) => animation.finished),
  84  |         ),
  85  |       ),
  86  |     );
  87  | }
  88  | async function noPageOverflow(page: Page) {
  89  |   const bounds = await page.evaluate(() => ({
  90  |     viewport: innerWidth,
  91  |     document: document.documentElement.scrollWidth,
  92  |     main: document.querySelector('.shell-main')?.clientWidth,
  93  |     scroll: document.querySelector('.shell-main')?.scrollWidth,
  94  |   }));
  95  |   expect(bounds.document).toBeLessThanOrEqual(bounds.viewport);
  96  |   if (bounds.main && bounds.scroll)
  97  |     expect(bounds.scroll, `Horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(
  98  |       bounds.main + 1,
  99  |     );
  100 |   return bounds;
  101 | }
  102 | for (const theme of ['dark', 'light'] as const)
  103 |   for (const width of [1440, 390]) {
  104 |     test(`${theme} ${width} shell states, keyboard access and visual baseline`, async ({
  105 |       browser,
  106 |     }) => {
  107 |       const context = await browser.newContext({
  108 |         viewport: { width, height: 1000 },
  109 |         colorScheme: theme,
  110 |         reducedMotion: 'reduce',
  111 |       });
  112 |       try {
  113 |         await login(context, 'owner');
  114 |         await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
  115 |         const page = await context.newPage();
  116 |         await page.goto(`/workspace/${workspace}/docs/${doc}`);
  117 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  118 |         await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  119 |         await expect(page.getByLabel('Server connected', { exact: true })).toBeAttached();
  120 |         await expect(
  121 |           page.getByRole('button', {
  122 |             name: 'Switch workspace: Sample workspace',
  123 |             includeHidden: true,
  124 |           }),
  125 |         ).toBeAttached();
  126 |         await page.addScriptTag({ content: axe.source });
  127 |         async function capture(state: string) {
  128 |           await settle(page);
  129 |           const result = await page.evaluate(async () => {
  130 |             const report = await window.axe.run(
  131 |               {
  132 |                 include: [
  133 |                   ['[data-shell-region], [role="dialog"], [role="menu"], [role="listbox"]'],
  134 |                 ],
  135 |               },
  136 |               { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
  137 |             );
  138 |             return { violations: report.violations, incomplete: report.incomplete };
  139 |           });
  140 |           reports.push({ theme, width, state, ...result });
  141 |           await writeFile(
  142 |             resolve(output, `axe-${theme}-${width}.json`),
  143 |             JSON.stringify(
  144 |               reports.filter((item) => item.theme === theme && item.width === width),
  145 |               null,
  146 |               2,
  147 |             ),
  148 |           );
  149 |           console.log(
  150 |             `${theme} ${width} ${state}: axe ${result.violations.length} violations, ${result.incomplete.length} incomplete`,
  151 |           );
  152 |           await page.screenshot({
  153 |             path: resolve(output, `${theme}-${width}-${state}.png`),
  154 |             fullPage: false,
  155 |             animations: 'disabled',
  156 |           });
  157 |           const bounds = await noPageOverflow(page);
  158 |           measurements.push({ theme, width, state, ...bounds });
  159 |           await writeFile(
  160 |             resolve(output, `bounds-${theme}-${width}.json`),
  161 |             JSON.stringify(
  162 |               measurements.filter((item) => item.theme === theme && item.width === width),
  163 |               null,
  164 |               2,
  165 |             ),
  166 |           );
  167 |           expect(
  168 |             result.violations.map(
  169 |               (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  170 |             ),
  171 |           ).toEqual([]);
  172 |           if (pass === 'final')
  173 |             await expect(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
  174 |               animations: 'disabled',
  175 |               mask: [page.locator('#route-content')],
  176 |               maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  177 |               maxDiffPixelRatio: 0.002,
  178 |             });
  179 |         }
  180 |         const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
```