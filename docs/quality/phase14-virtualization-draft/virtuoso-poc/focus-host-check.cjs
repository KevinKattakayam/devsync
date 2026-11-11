const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
  });
  const width = Number(process.env.POC_WIDTH || 1440);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const report = { width, tasks: 1000 };
  try {
    await page.goto('http://127.0.0.1:3419/');
    const host = page.getByRole('grid', { name: 'Tasks' });
    await host.waitFor();
    await page.addScriptTag({
      path: '/home/kevin/devsync/frontend/node_modules/axe-core/axe.min.js',
    });
    report.axe = await page.evaluate(async () => {
      const r = await window.axe.run(document);
      return {
        violations: r.violations.map((x) => x.id),
        incomplete: r.incomplete.map((x) => x.id),
      };
    });
    await page.keyboard.press('Tab');
    assert.equal(await host.evaluate((e) => e === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () =>
        document.querySelector('[role=grid]')?.getAttribute('aria-activedescendant') === 'row-1',
    );
    report.initialRows = await page.locator('[data-task]').count();
    const scroller = page.locator('[data-virtuoso-scroller="true"]');
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="999"]').waitFor();
    report.rowsAtEnd = await page.locator('[data-task]').count();
    report.hostRetainsFocus = await host.evaluate((e) => e === document.activeElement);
    report.activeDescendantOffscreen = await host.getAttribute('aria-activedescendant');
    report.status = await page.getByRole('status').textContent();
    await page.keyboard.press('ArrowDown');
    await page.locator('[data-task="2"]').waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[role=grid]')?.getAttribute('aria-activedescendant') === 'row-2',
    );
    await page.setViewportSize({ width: width === 1440 ? 390 : 1440, height: 700 });
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'grid');
    report.focusRestored = await host.evaluate((e) => e === document.activeElement);
    report.activeAfterEscape = await host.getAttribute('aria-activedescendant');
    report.rowsAfterResize = await page.locator('[data-task]').count();
    await page.keyboard.press('Tab');
    report.openActionFocused = await page
      .getByRole('button', { name: 'Open Task 2' })
      .evaluate((e) => e === document.activeElement);
    await page.keyboard.press('Tab');
    const move = page.getByRole('combobox', { name: 'Move Task 2' });
    report.moveActionFocused = await move.evaluate((e) => e === document.activeElement);
    await page.keyboard.press('End');
    report.fixtureDestination = await move.inputValue();
    await page.keyboard.press('Tab');
    report.canTabOut = await page
      .getByRole('button', { name: 'After list' })
      .evaluate((e) => e === document.activeElement);
    await page.keyboard.press('Shift+Tab');
    report.canShiftTabBack = await move.evaluate((e) => e === document.activeElement);
    assert.deepEqual(report.axe.violations, []);
    assert.equal(report.openActionFocused, true);
    assert.equal(report.moveActionFocused, true);
    assert.equal(report.fixtureDestination, 'Done');
    assert.equal(report.canTabOut, true);
    assert.equal(report.canShiftTabBack, true);
    assert.equal(report.hostRetainsFocus, true);
    assert.equal(report.activeDescendantOffscreen, null);
    assert.equal(report.focusRestored, true);
    assert.ok(report.initialRows < 40 && report.rowsAtEnd < 40 && report.rowsAfterResize < 40);
    console.log(JSON.stringify(report));
  } catch (e) {
    console.log(JSON.stringify({ ...report, error: String(e).slice(0, 500) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
