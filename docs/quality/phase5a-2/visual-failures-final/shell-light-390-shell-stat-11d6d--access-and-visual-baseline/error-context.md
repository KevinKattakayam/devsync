# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shell.spec.ts >> light 390 shell states, keyboard access and visual baseline
- Location: testing/browser/shell.spec.ts:106:9

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  11719 pixels (ratio 0.04 of all image pixels) are different.

  Snapshot: light-390-default.png

Call log:
  - Expect "toHaveScreenshot(light-390-default.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 11719 pixels (ratio 0.04 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 11719 pixels (ratio 0.04 of all image pixels) are different.

```

# Test source

```ts
  80  |   await page
  81  |     .locator('.ui-floating, .ui-dialog, .ui-drawer')
  82  |     .evaluateAll((elements) =>
  83  |       Promise.all(
  84  |         elements.flatMap((element) =>
  85  |           element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
  86  |         ),
  87  |       ),
  88  |     );
  89  | }
  90  | async function noPageOverflow(page: Page) {
  91  |   const bounds = await page.evaluate(() => ({
  92  |     viewport: innerWidth,
  93  |     document: document.documentElement.scrollWidth,
  94  |     main: document.querySelector('.shell-main')?.clientWidth,
  95  |     scroll: document.querySelector('.shell-main')?.scrollWidth,
  96  |   }));
  97  |   expect(bounds.document).toBeLessThanOrEqual(bounds.viewport);
  98  |   if (bounds.main && bounds.scroll)
  99  |     expect(bounds.scroll, `Horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(
  100 |       bounds.main + 1,
  101 |     );
  102 |   return bounds;
  103 | }
  104 | for (const theme of ['dark', 'light'] as const)
  105 |   for (const width of [1440, 390]) {
  106 |     test(`${theme} ${width} shell states, keyboard access and visual baseline`, async ({
  107 |       browser,
  108 |     }) => {
  109 |       const context = await browser.newContext({
  110 |         viewport: { width, height: 1000 },
  111 |         colorScheme: theme,
  112 |         reducedMotion: 'reduce',
  113 |       });
  114 |       try {
  115 |         await login(context, 'owner');
  116 |         await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
  117 |         const page = await context.newPage();
  118 |         await page.goto(`/workspace/${workspace}/docs/${doc}`);
  119 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  120 |         await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  121 |         // Write permission and Socket.IO presence do not prove the CRDT handshake/ack completed.
  122 |         await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  123 |         await expect(
  124 |           page.getByRole('status').filter({ hasText: 'Offline (Saving Locally)' }),
  125 |         ).toHaveCount(0);
  126 |         await expect(page.getByLabel('Server connected', { exact: true })).toBeAttached();
  127 |         await expect(
  128 |           page.getByRole('button', {
  129 |             name: 'Switch workspace: Sample workspace',
  130 |             includeHidden: true,
  131 |           }),
  132 |         ).toBeAttached();
  133 |         await page.addScriptTag({ content: axe.source });
  134 |         async function capture(state: string) {
  135 |           await settle(page);
  136 |           const result = await page.evaluate(async () => {
  137 |             const report = await window.axe.run(
  138 |               {
  139 |                 include: [
  140 |                   ['[data-shell-region], [role="dialog"], [role="menu"], [role="listbox"]'],
  141 |                 ],
  142 |               },
  143 |               { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
  144 |             );
  145 |             return { violations: report.violations, incomplete: report.incomplete };
  146 |           });
  147 |           reports.push({ theme, width, state, ...result });
  148 |           await writeFile(
  149 |             resolve(output, `axe-${theme}-${width}.json`),
  150 |             JSON.stringify(
  151 |               reports.filter((item) => item.theme === theme && item.width === width),
  152 |               null,
  153 |               2,
  154 |             ),
  155 |           );
  156 |           console.log(
  157 |             `${theme} ${width} ${state}: axe ${result.violations.length} violations, ${result.incomplete.length} incomplete`,
  158 |           );
  159 |           await page.screenshot({
  160 |             path: resolve(output, `${theme}-${width}-${state}.png`),
  161 |             fullPage: false,
  162 |             animations: 'disabled',
  163 |           });
  164 |           const bounds = await noPageOverflow(page);
  165 |           measurements.push({ theme, width, state, ...bounds });
  166 |           await writeFile(
  167 |             resolve(output, `bounds-${theme}-${width}.json`),
  168 |             JSON.stringify(
  169 |               measurements.filter((item) => item.theme === theme && item.width === width),
  170 |               null,
  171 |               2,
  172 |             ),
  173 |           );
  174 |           expect(
  175 |             result.violations.map(
  176 |               (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  177 |             ),
  178 |           ).toEqual([]);
  179 |           if (pass === 'final')
> 180 |             await expect(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
      |                                ^ Error: expect(page).toHaveScreenshot(expected) failed
  181 |               animations: 'disabled',
  182 |               mask: [page.locator('#route-content')],
  183 |               maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  184 |               maxDiffPixelRatio: 0.002,
  185 |             });
  186 |         }
  187 |         const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
  188 |         expect(titleBounds?.width).toBeGreaterThan(width < 768 ? 250 : 500);
  189 |         measurements.push({ theme, width, state: 'title', bounds: titleBounds });
  190 |         await capture('default');
  191 |         const trigger = page.getByRole('button', { name: 'Search and commands', exact: true });
  192 |         await trigger.focus();
  193 |         await page.keyboard.press('Control+k');
  194 |         await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
  195 |         await capture('commands');
  196 |         await page.getByRole('combobox', { name: 'Search commands' }).fill('unmatched-command');
  197 |         await capture('commands-empty');
  198 |         await page.keyboard.press('Escape');
  199 |         await expect(trigger).toBeFocused();
  200 |         await page.getByLabel('Document title', { exact: true }).focus();
  201 |         await page.keyboard.press('ArrowRight');
  202 |         // ? must type in editors, never steal focus; avoid changing persisted seed title.
  203 |         await page.keyboard.press('Shift+/');
  204 |         await expect(page.getByRole('dialog')).toHaveCount(0);
  205 |         await page.keyboard.press('Backspace');
  206 |         await trigger.focus();
  207 |         await page.keyboard.press('?');
  208 |         await capture('help');
  209 |         await page.keyboard.press('Tab');
  210 |         const trapped = await page.evaluate(
  211 |           () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  212 |         );
  213 |         expect(trapped).toBe(true);
  214 |         await page.keyboard.press('Escape');
  215 |         await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  216 |         await capture('focus');
  217 |         await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  218 |         await page.getByRole('button', { name: 'Sample owner', exact: true }).click();
  219 |         await capture('user-menu');
  220 |         await page.keyboard.press('Escape');
  221 |         if (width >= 768) {
  222 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  223 |           await capture('workspace-menu');
  224 |           await page.keyboard.press('Escape');
  225 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  226 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).focus();
  227 |           await page.keyboard.press('Enter');
  228 |           await expect(page.getByRole('link', { name: 'Keyboard interactions' })).toBeVisible();
  229 |           await capture('document-tree');
  230 |           await page.getByRole('button', { name: 'Collapse sidebar' }).focus();
  231 |           await page.keyboard.press('Enter');
  232 |           await capture('collapsed');
  233 |           await page.getByRole('button', { name: 'Expand sidebar' }).click();
  234 |         } else {
  235 |           const mobileTrigger = page.getByRole('button', { name: 'Open navigation' });
  236 |           await mobileTrigger.click();
  237 |           await capture('mobile-navigation');
  238 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  239 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).click();
  240 |           await capture('document-tree');
  241 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  242 |           await capture('workspace-menu');
  243 |           await page.keyboard.press('Escape');
  244 |           await page.keyboard.press('Escape');
  245 |           await expect(mobileTrigger).toBeFocused();
  246 |         }
  247 |         await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  248 |         await capture('copilot');
  249 |         await page.keyboard.press('Escape');
  250 |       } finally {
  251 |         await context.close();
  252 |       }
  253 |     });
  254 |   }
  255 | 
  256 | test('360px route coverage and viewer commands retain read-only authority', async ({ browser }) => {
  257 |   const context = await browser.newContext({
  258 |     viewport: { width: 360, height: 900 },
  259 |     reducedMotion: 'reduce',
  260 |   });
  261 |   try {
  262 |     await login(context, 'viewer');
  263 |     const page = await context.newPage();
  264 |     for (const route of [
  265 |       '/dashboard',
  266 |       `/workspace/${workspace}`,
  267 |       `/workspace/${workspace}/docs`,
  268 |       `/workspace/${workspace}/docs/${doc}`,
  269 |       `/workspace/${workspace}/kanban`,
  270 |       `/workspace/${workspace}/snippets`,
  271 |       `/workspace/${workspace}/settings`,
  272 |       '/settings/billing',
  273 |     ]) {
  274 |       await page.goto(route);
  275 |       await expect(page.getByRole('button', { name: 'Search and commands' })).toBeVisible();
  276 |       if (route.endsWith(`/${doc}`))
  277 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  278 |       else await page.locator('#route-content h1').waitFor();
  279 |       const bounds = await noPageOverflow(page);
  280 |       measurements.push({ route, width: 360, ...bounds });
```