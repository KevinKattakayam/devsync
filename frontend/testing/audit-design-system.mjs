// Component-only browser axe audit. No identity, product API or fixture capability is used.
import { chromium } from '../../backend/node_modules/playwright-core/index.mjs';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM_PATH || '/opt/google/chrome/chrome',
  headless: true,
});
const results = [];
const output = new URL('../../docs/ui/phase2-evidence/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const theme of ['dark', 'light']) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
      });
      await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3001/design-system');
      await page.getByRole('heading', { name: 'Design system', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      async function audit(state) {
        await page
          .locator('.ui-floating, .ui-dialog, .ui-drawer')
          .evaluateAll((elements) =>
            Promise.all(
              elements.flatMap((element) =>
                element.getAnimations().map((animation) => animation.finished),
              ),
            ),
          );
        const result = await page.evaluate(async () => {
          const report = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          });
          return {
            violations: report.violations,
            incomplete: report.incomplete.map((item) => ({
              id: item.id,
              targets: item.nodes.map((node) => node.target),
            })),
          };
        });
        results.push({ theme, width, state, ...result });
        console.log(
          `${theme} ${width} ${state}: ${result.violations.length} violations; ${result.incomplete.length} rules require manual review`,
        );
      }
      if (!(await page.getByRole('heading', { name: 'Design system', exact: true }).isVisible()))
        throw new Error('Workbench is inaccessible');
      await audit('default');
      for (const [state, label] of [
        ['dialog', 'Open dialog'],
        ['drawer', 'Open drawer'],
        ['popover', 'Open popover'],
        ['menu', 'Open menu'],
      ]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await audit(state);
        await page.keyboard.press('Escape');
      }
      await page.getByRole('combobox', { name: 'Destination', exact: true }).click();
      await audit('select');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Commands/ }).click();
      await audit('commands');
      await page.getByRole('combobox', { name: 'Search commands' }).fill('no-such-command');
      await audit('commands-empty');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Focus for tooltip', exact: true }).focus();
      await page.getByRole('tooltip').waitFor();
      await audit('tooltip');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Success toast', exact: true }).click();
      await page.getByText('Example saved', { exact: true }).waitFor();
      await audit('toast');
      await context.close();
    }
  }
} finally {
  await writeFile(new URL('gallery-axe.json', output), JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.some((result) => result.violations.length > 0)) process.exitCode = 1;
