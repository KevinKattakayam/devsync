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

  32803 pixels (ratio 0.09 of all image pixels) are different.

  Snapshot: light-390-commands.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-commands.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 32803 pixels (ratio 0.09 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 32803 pixels (ratio 0.09 of all image pixels) are different.

```

```
Error: expect(page).toHaveScreenshot(expected) failed

  77284 pixels (ratio 0.20 of all image pixels) are different.

  Snapshot: light-390-commands-empty.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-commands-empty.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 77284 pixels (ratio 0.20 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 77284 pixels (ratio 0.20 of all image pixels) are different.

```

```
Error: expect(page).toHaveScreenshot(expected) failed

  68511 pixels (ratio 0.18 of all image pixels) are different.

  Snapshot: light-390-help.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-help.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 68511 pixels (ratio 0.18 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 68511 pixels (ratio 0.18 of all image pixels) are different.

```

```
Error: expect(page).toHaveScreenshot(expected) failed

  15959 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: light-390-mobile-navigation.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-mobile-navigation.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 15959 pixels (ratio 0.05 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 15959 pixels (ratio 0.05 of all image pixels) are different.

```

```
Error: expect(page).toHaveScreenshot(expected) failed

  15959 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: light-390-document-tree.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-document-tree.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 15959 pixels (ratio 0.05 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 15959 pixels (ratio 0.05 of all image pixels) are different.

```

```
Error: expect(page).toHaveScreenshot(expected) failed

  15959 pixels (ratio 0.05 of all image pixels) are different.

  Snapshot: light-390-workspace-menu.png

Call log:
  - Expect "soft toHaveScreenshot(light-390-workspace-menu.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 15959 pixels (ratio 0.05 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 15959 pixels (ratio 0.05 of all image pixels) are different.

```

# Test source

```ts
  128 |           socket.on('close', () => record('closed'));
  129 |           socket.on('socketerror', () => record('error'));
  130 |         });
  131 |         async function recordState(stage: string) {
  132 |           const state = await page.evaluate(() => ({
  133 |             saved: Array.from(document.querySelectorAll('[role="status"]')).some(
  134 |               (node) => node.textContent === 'Saved',
  135 |             ),
  136 |             offline: Array.from(document.querySelectorAll('[role="status"]')).some((node) =>
  137 |               node.textContent?.includes('Offline (Saving Locally)'),
  138 |             ),
  139 |             editorCount: document.querySelectorAll('.ProseMirror').length,
  140 |             editable: document.querySelector('.ProseMirror')?.getAttribute('contenteditable'),
  141 |             routeHeight: document.querySelector('#route-content')?.getBoundingClientRect().height,
  142 |             animations: Array.from(
  143 |               document.querySelectorAll('.ui-floating, .ui-dialog, .ui-drawer'),
  144 |             ).flatMap((element) =>
  145 |               element.getAnimations().map((animation) => ({
  146 |                 hasLayoutRect: element.getClientRects().length > 0,
  147 |                 state: animation.playState,
  148 |                 pending: animation.pending,
  149 |               })),
  150 |             ),
  151 |           }));
  152 |           await writeFile(
  153 |             resolve(output, `diagnostic-${theme}-${width}-${stage}.json`),
  154 |             JSON.stringify({ elapsed: Date.now() - started, ...state, transport }, null, 2),
  155 |           );
  156 |         }
  157 |         await page.goto(`/workspace/${workspace}/docs/${doc}`);
  158 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  159 |         await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  160 |         // Write permission and Socket.IO presence do not prove the CRDT handshake/ack completed.
  161 |         await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  162 |         await expect(
  163 |           page.getByRole('status').filter({ hasText: 'Offline (Saving Locally)' }),
  164 |         ).toHaveCount(0);
  165 |         await expect(page.getByLabel('Server connected', { exact: true })).toBeAttached();
  166 |         await expect(
  167 |           page.getByRole('button', {
  168 |             name: 'Switch workspace: Sample workspace',
  169 |             includeHidden: true,
  170 |           }),
  171 |         ).toBeAttached();
  172 |         await page.addScriptTag({ content: axe.source });
  173 |         async function capture(state: string) {
  174 |           await recordState(`${state}-before-settle`);
  175 |           await settle(page);
  176 |           await recordState(`${state}-before-axe`);
  177 |           const result = await page.evaluate(async () => {
  178 |             const report = await window.axe.run(
  179 |               {
  180 |                 include: [
  181 |                   ['[data-shell-region], [role="dialog"], [role="menu"], [role="listbox"]'],
  182 |                 ],
  183 |               },
  184 |               { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } },
  185 |             );
  186 |             return { violations: report.violations, incomplete: report.incomplete };
  187 |           });
  188 |           await recordState(`${state}-after-axe`);
  189 |           await expect(
  190 |             page
  191 |               .getByRole('status', { includeHidden: true })
  192 |               .filter({ hasText: 'Offline (Saving Locally)' }),
  193 |           ).toHaveCount(0);
  194 |           reports.push({ theme, width, state, ...result });
  195 |           await writeFile(
  196 |             resolve(output, `axe-${theme}-${width}.json`),
  197 |             JSON.stringify(
  198 |               reports.filter((item) => item.theme === theme && item.width === width),
  199 |               null,
  200 |               2,
  201 |             ),
  202 |           );
  203 |           console.log(
  204 |             `${theme} ${width} ${state}: axe ${result.violations.length} violations, ${result.incomplete.length} incomplete`,
  205 |           );
  206 |           await page.screenshot({
  207 |             path: resolve(output, `${theme}-${width}-${state}.png`),
  208 |             fullPage: false,
  209 |             animations: 'disabled',
  210 |           });
  211 |           const bounds = await noPageOverflow(page);
  212 |           measurements.push({ theme, width, state, ...bounds });
  213 |           await writeFile(
  214 |             resolve(output, `bounds-${theme}-${width}.json`),
  215 |             JSON.stringify(
  216 |               measurements.filter((item) => item.theme === theme && item.width === width),
  217 |               null,
  218 |               2,
  219 |             ),
  220 |           );
  221 |           expect(
  222 |             result.violations.map(
  223 |               (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  224 |             ),
  225 |           ).toEqual([]);
  226 |           if (pass === 'final')
  227 |             // Keep failures fatal to the test, but collect every state for image-by-image review.
> 228 |             await expect.soft(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
      |                                     ^ Error: expect(page).toHaveScreenshot(expected) failed
  229 |               animations: 'disabled',
  230 |               mask: [page.locator('#route-content')],
  231 |               maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  232 |               maxDiffPixelRatio: 0.002,
  233 |             });
  234 |         }
  235 |         const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
  236 |         expect(titleBounds?.width).toBeGreaterThan(width < 768 ? 250 : 500);
  237 |         measurements.push({ theme, width, state: 'title', bounds: titleBounds });
  238 |         await capture('default');
  239 |         const trigger = page.getByRole('button', { name: 'Search and commands', exact: true });
  240 |         await trigger.focus();
  241 |         await page.keyboard.press('Control+k');
  242 |         await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
  243 |         await capture('commands');
  244 |         await page.getByRole('combobox', { name: 'Search commands' }).fill('unmatched-command');
  245 |         await capture('commands-empty');
  246 |         await page.keyboard.press('Escape');
  247 |         await expect(trigger).toBeFocused();
  248 |         await page.getByLabel('Document title', { exact: true }).focus();
  249 |         await page.keyboard.press('ArrowRight');
  250 |         // ? must type in editors, never steal focus; avoid changing persisted seed title.
  251 |         await page.keyboard.press('Shift+/');
  252 |         await expect(page.getByRole('dialog')).toHaveCount(0);
  253 |         await page.keyboard.press('Backspace');
  254 |         await trigger.focus();
  255 |         await page.keyboard.press('?');
  256 |         await capture('help');
  257 |         await page.keyboard.press('Tab');
  258 |         const trapped = await page.evaluate(
  259 |           () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  260 |         );
  261 |         expect(trapped).toBe(true);
  262 |         await page.keyboard.press('Escape');
  263 |         await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  264 |         await capture('focus');
  265 |         await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  266 |         await page.getByRole('button', { name: 'Sample owner', exact: true }).click();
  267 |         await capture('user-menu');
  268 |         await page.keyboard.press('Escape');
  269 |         if (width >= 768) {
  270 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  271 |           await capture('workspace-menu');
  272 |           await page.keyboard.press('Escape');
  273 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  274 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).focus();
  275 |           await page.keyboard.press('Enter');
  276 |           await expect(page.getByRole('link', { name: 'Keyboard interactions' })).toBeVisible();
  277 |           await capture('document-tree');
  278 |           await page.getByRole('button', { name: 'Collapse sidebar' }).focus();
  279 |           await page.keyboard.press('Enter');
  280 |           await capture('collapsed');
  281 |           await page.getByRole('button', { name: 'Expand sidebar' }).click();
  282 |         } else {
  283 |           const mobileTrigger = page.getByRole('button', { name: 'Open navigation' });
  284 |           await mobileTrigger.click();
  285 |           await capture('mobile-navigation');
  286 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  287 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).click();
  288 |           await capture('document-tree');
  289 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  290 |           await capture('workspace-menu');
  291 |           await page.keyboard.press('Escape');
  292 |           await page.keyboard.press('Escape');
  293 |           await expect(mobileTrigger).toBeFocused();
  294 |         }
  295 |         await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  296 |         await capture('copilot');
  297 |         await page.keyboard.press('Escape');
  298 |       } finally {
  299 |         await context.close();
  300 |       }
  301 |     });
  302 |   }
  303 | 
  304 | test('360px route coverage and viewer commands retain read-only authority', async ({ browser }) => {
  305 |   const context = await browser.newContext({
  306 |     viewport: { width: 360, height: 900 },
  307 |     reducedMotion: 'reduce',
  308 |   });
  309 |   try {
  310 |     await login(context, 'viewer');
  311 |     const page = await context.newPage();
  312 |     for (const route of [
  313 |       '/dashboard',
  314 |       `/workspace/${workspace}`,
  315 |       `/workspace/${workspace}/docs`,
  316 |       `/workspace/${workspace}/docs/${doc}`,
  317 |       `/workspace/${workspace}/kanban`,
  318 |       `/workspace/${workspace}/snippets`,
  319 |       `/workspace/${workspace}/settings`,
  320 |       '/settings/billing',
  321 |     ]) {
  322 |       await page.goto(route);
  323 |       await expect(page.getByRole('button', { name: 'Search and commands' })).toBeVisible();
  324 |       if (route.endsWith(`/${doc}`))
  325 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  326 |       else await page.locator('#route-content h1').waitFor();
  327 |       const bounds = await noPageOverflow(page);
  328 |       measurements.push({ route, width: 360, ...bounds });
```