# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shell.spec.ts >> dark 390 shell states, keyboard access and visual baseline
- Location: testing/browser/shell.spec.ts:106:9

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  859 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: dark-390-commands.png

Call log:
  - Expect "toHaveScreenshot(dark-390-commands.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 859 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 859 pixels (ratio 0.01 of all image pixels) are different.

```

# Test source

```ts
  122 |           const record = (event: string) => {
  123 |             if (transport.length < 200) transport.push({ event, elapsed: Date.now() - started });
  124 |           };
  125 |           record('created');
  126 |           socket.on('framesent', () => record('sent'));
  127 |           socket.on('framereceived', () => record('received'));
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
  146 |                 visible: element.getClientRects().length > 0,
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
  189 |           reports.push({ theme, width, state, ...result });
  190 |           await writeFile(
  191 |             resolve(output, `axe-${theme}-${width}.json`),
  192 |             JSON.stringify(
  193 |               reports.filter((item) => item.theme === theme && item.width === width),
  194 |               null,
  195 |               2,
  196 |             ),
  197 |           );
  198 |           console.log(
  199 |             `${theme} ${width} ${state}: axe ${result.violations.length} violations, ${result.incomplete.length} incomplete`,
  200 |           );
  201 |           await page.screenshot({
  202 |             path: resolve(output, `${theme}-${width}-${state}.png`),
  203 |             fullPage: false,
  204 |             animations: 'disabled',
  205 |           });
  206 |           const bounds = await noPageOverflow(page);
  207 |           measurements.push({ theme, width, state, ...bounds });
  208 |           await writeFile(
  209 |             resolve(output, `bounds-${theme}-${width}.json`),
  210 |             JSON.stringify(
  211 |               measurements.filter((item) => item.theme === theme && item.width === width),
  212 |               null,
  213 |               2,
  214 |             ),
  215 |           );
  216 |           expect(
  217 |             result.violations.map(
  218 |               (item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  219 |             ),
  220 |           ).toEqual([]);
  221 |           if (pass === 'final')
> 222 |             await expect(page).toHaveScreenshot(`${theme}-${width}-${state}.png`, {
      |                                ^ Error: expect(page).toHaveScreenshot(expected) failed
  223 |               animations: 'disabled',
  224 |               mask: [page.locator('#route-content')],
  225 |               maskColor: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  226 |               maxDiffPixelRatio: 0.002,
  227 |             });
  228 |         }
  229 |         const titleBounds = await page.getByLabel('Document title', { exact: true }).boundingBox();
  230 |         expect(titleBounds?.width).toBeGreaterThan(width < 768 ? 250 : 500);
  231 |         measurements.push({ theme, width, state: 'title', bounds: titleBounds });
  232 |         await capture('default');
  233 |         const trigger = page.getByRole('button', { name: 'Search and commands', exact: true });
  234 |         await trigger.focus();
  235 |         await page.keyboard.press('Control+k');
  236 |         await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
  237 |         await capture('commands');
  238 |         await page.getByRole('combobox', { name: 'Search commands' }).fill('unmatched-command');
  239 |         await capture('commands-empty');
  240 |         await page.keyboard.press('Escape');
  241 |         await expect(trigger).toBeFocused();
  242 |         await page.getByLabel('Document title', { exact: true }).focus();
  243 |         await page.keyboard.press('ArrowRight');
  244 |         // ? must type in editors, never steal focus; avoid changing persisted seed title.
  245 |         await page.keyboard.press('Shift+/');
  246 |         await expect(page.getByRole('dialog')).toHaveCount(0);
  247 |         await page.keyboard.press('Backspace');
  248 |         await trigger.focus();
  249 |         await page.keyboard.press('?');
  250 |         await capture('help');
  251 |         await page.keyboard.press('Tab');
  252 |         const trapped = await page.evaluate(
  253 |           () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  254 |         );
  255 |         expect(trapped).toBe(true);
  256 |         await page.keyboard.press('Escape');
  257 |         await page.getByRole('button', { name: 'Enter focus mode', exact: true }).click();
  258 |         await capture('focus');
  259 |         await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();
  260 |         await page.getByRole('button', { name: 'Sample owner', exact: true }).click();
  261 |         await capture('user-menu');
  262 |         await page.keyboard.press('Escape');
  263 |         if (width >= 768) {
  264 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  265 |           await capture('workspace-menu');
  266 |           await page.keyboard.press('Escape');
  267 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  268 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).focus();
  269 |           await page.keyboard.press('Enter');
  270 |           await expect(page.getByRole('link', { name: 'Keyboard interactions' })).toBeVisible();
  271 |           await capture('document-tree');
  272 |           await page.getByRole('button', { name: 'Collapse sidebar' }).focus();
  273 |           await page.keyboard.press('Enter');
  274 |           await capture('collapsed');
  275 |           await page.getByRole('button', { name: 'Expand sidebar' }).click();
  276 |         } else {
  277 |           const mobileTrigger = page.getByRole('button', { name: 'Open navigation' });
  278 |           await mobileTrigger.click();
  279 |           await capture('mobile-navigation');
  280 |           await page.getByRole('button', { name: 'Expand Welcome', exact: true }).click();
  281 |           await page.getByRole('button', { name: 'Expand Interface guidelines' }).click();
  282 |           await capture('document-tree');
  283 |           await page.getByRole('button', { name: 'Switch workspace: Sample workspace' }).click();
  284 |           await capture('workspace-menu');
  285 |           await page.keyboard.press('Escape');
  286 |           await page.keyboard.press('Escape');
  287 |           await expect(mobileTrigger).toBeFocused();
  288 |         }
  289 |         await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
  290 |         await capture('copilot');
  291 |         await page.keyboard.press('Escape');
  292 |       } finally {
  293 |         await context.close();
  294 |       }
  295 |     });
  296 |   }
  297 | 
  298 | test('360px route coverage and viewer commands retain read-only authority', async ({ browser }) => {
  299 |   const context = await browser.newContext({
  300 |     viewport: { width: 360, height: 900 },
  301 |     reducedMotion: 'reduce',
  302 |   });
  303 |   try {
  304 |     await login(context, 'viewer');
  305 |     const page = await context.newPage();
  306 |     for (const route of [
  307 |       '/dashboard',
  308 |       `/workspace/${workspace}`,
  309 |       `/workspace/${workspace}/docs`,
  310 |       `/workspace/${workspace}/docs/${doc}`,
  311 |       `/workspace/${workspace}/kanban`,
  312 |       `/workspace/${workspace}/snippets`,
  313 |       `/workspace/${workspace}/settings`,
  314 |       '/settings/billing',
  315 |     ]) {
  316 |       await page.goto(route);
  317 |       await expect(page.getByRole('button', { name: 'Search and commands' })).toBeVisible();
  318 |       if (route.endsWith(`/${doc}`))
  319 |         await expect(page.getByLabel('Document title', { exact: true })).toHaveValue('Welcome');
  320 |       else await page.locator('#route-content h1').waitFor();
  321 |       const bounds = await noPageOverflow(page);
  322 |       measurements.push({ route, width: 360, ...bounds });
```