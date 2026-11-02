# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shell.spec.ts >> light 1440 shell states, keyboard access and visual baseline
- Location: testing/browser/shell.spec.ts:104:9

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  7867 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: light-1440-default.png

Call log:
  - Expect "toHaveScreenshot(light-1440-default.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 7867 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 7867 pixels (ratio 0.01 of all image pixels) are different.

```

# Test source

```ts
  73  |   await writeFile(resolve(output, 'axe.json'), JSON.stringify(allReports, null, 2));
  74  |   await writeFile(resolve(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  75  | });
  76  | async function settle(page: Page) {
  77  |   await page.evaluate(() => document.fonts.ready);
  78  |   await page
  79  |     .locator('.ui-floating, .ui-dialog, .ui-drawer')
  80  |     .evaluateAll((elements) =>
  81  |       Promise.all(
  82  |         elements.flatMap((element) =>
  83  |           element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
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
> 173 |             await expect(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
      |                                ^ Error: expect(page).toHaveScreenshot(expected) failed
  174 |               animations: 'disabled',
  175 |               mask: [page.locator('#route-content')],
  176 |               maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  177 |               maxDiffPixelRatio: 0.002,
  178 |             });
  179 |         }
  180 |         const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
  181 |         expect(titleBounds?.width).toBeGreaterThan(width < 768 ? 250 : 500);
  182 |         measurements.push({ theme, width, state: 'title', bounds: titleBounds });
  183 |         await capture('default');
  184 |         const trigger = page.getByRole('button', { name: 'Search and commands', exact: true });
  185 |         await trigger.focus();
  186 |         await page.keyboard.press('Control+k');
  187 |         await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
  188 |         await capture('commands');
  189 |         await page.getByRole('combobox', { name: 'Search commands' }).fill('unmatched-command');
  190 |         await capture('commands-empty');
  191 |         await page.keyboard.press('Escape');
  192 |         await expect(trigger).toBeFocused();
  193 |         await page.getByLabel('Document title', { exact: true }).focus();
  194 |         await page.keyboard.press('ArrowRight');
  195 |         // ? must type in editors, never steal focus; avoid changing persisted seed title.
  196 |         await page.keyboard.press('Shift+/');
  197 |         await expect(page.getByRole('dialog')).toHaveCount(0);
  198 |         await page.keyboard.press('Backspace');
  199 |         await trigger.focus();
  200 |         await page.keyboard.press('?');
  201 |         await capture('help');
  202 |         await page.keyboard.press('Tab');
  203 |         const trapped = await page.evaluate(
  204 |           () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  205 |         );
  206 |         expect(trapped).toBe(true);
  207 |         await page.keyboard.press('Escape');
  208 |         await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  209 |         await capture('focus');
  210 |         await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  211 |         await page.getByRole('button', { name: 'Sample owner', exact: true }).click();
  212 |         await capture('user-menu');
  213 |         await page.keyboard.press('Escape');
  214 |         if (width >= 768) {
  215 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  216 |           await capture('workspace-menu');
  217 |           await page.keyboard.press('Escape');
  218 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  219 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).focus();
  220 |           await page.keyboard.press('Enter');
  221 |           await expect(page.getByRole('link', { name: 'Keyboard interactions' })).toBeVisible();
  222 |           await capture('document-tree');
  223 |           await page.getByRole('button', { name: 'Collapse sidebar' }).focus();
  224 |           await page.keyboard.press('Enter');
  225 |           await capture('collapsed');
  226 |           await page.getByRole('button', { name: 'Expand sidebar' }).click();
  227 |         } else {
  228 |           const mobileTrigger = page.getByRole('button', { name: 'Open navigation' });
  229 |           await mobileTrigger.click();
  230 |           await capture('mobile-navigation');
  231 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  232 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).click();
  233 |           await capture('document-tree');
  234 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  235 |           await capture('workspace-menu');
  236 |           await page.keyboard.press('Escape');
  237 |           await page.keyboard.press('Escape');
  238 |           await expect(mobileTrigger).toBeFocused();
  239 |         }
  240 |         await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  241 |         await capture('copilot');
  242 |         await page.keyboard.press('Escape');
  243 |       } finally {
  244 |         await context.close();
  245 |       }
  246 |     });
  247 |   }
  248 | 
  249 | test('360px route coverage and viewer commands retain read-only authority', async ({ browser }) => {
  250 |   const context = await browser.newContext({
  251 |     viewport: { width: 360, height: 900 },
  252 |     reducedMotion: 'reduce',
  253 |   });
  254 |   try {
  255 |     await login(context, 'viewer');
  256 |     const page = await context.newPage();
  257 |     for (const route of [
  258 |       '/dashboard',
  259 |       `/workspace/${workspace}`,
  260 |       `/workspace/${workspace}/docs`,
  261 |       `/workspace/${workspace}/docs/${doc}`,
  262 |       `/workspace/${workspace}/kanban`,
  263 |       `/workspace/${workspace}/snippets`,
  264 |       `/workspace/${workspace}/settings`,
  265 |       '/settings/billing',
  266 |     ]) {
  267 |       await page.goto(route);
  268 |       await expect(page.getByRole('button', { name: 'Search and commands' })).toBeVisible();
  269 |       if (route.endsWith(`/${doc}`))
  270 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  271 |       else await page.locator('#route-content h1').waitFor();
  272 |       const bounds = await noPageOverflow(page);
  273 |       measurements.push({ route, width: 360, ...bounds });
```