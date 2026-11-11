const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: Number(process.env.POC_WIDTH || 1440), height: 900 },
  });
  const report = { fixtureTasks: 1000, width: Number(process.env.POC_WIDTH || 1440) };
  try {
    await page.goto('http://127.0.0.1:3419/');
    await page.locator('[data-task="task-0"]').waitFor();
    const scroller = page.locator('[data-virtuoso-scroller="true"]');
    report.initialRows = await page.locator('[data-task]').count();
    report.initialLongRowHeight = (await page.locator('[data-task="task-0"]').boundingBox()).height;
    await page.setViewportSize({ width: report.width === 1440 ? 390 : 1440, height: 900 });
    await page.waitForTimeout(200);
    report.resizedLongRowHeight = (await page.locator('[data-task="task-0"]').boundingBox()).height;
    report.rowsAfterResize = await page.locator('[data-task]').count();
    assert.notEqual(report.initialLongRowHeight, report.resizedLongRowHeight);
    assert.ok(report.rowsAfterResize < 40);
    await page.setViewportSize({ width: report.width, height: 900 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    report.keyboardFirstTarget = await page.evaluate(() => document.activeElement?.tagName);
    await page.keyboard.press('Tab');
    report.keyboardFirstTask = await page.evaluate(() => document.activeElement?.textContent);
    assert.equal(report.keyboardFirstTask, 'Task 0');
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    report.endRows = await page.locator('[data-task]').count();
    report.focusedTaskMounted = await page.locator('[data-task="task-0"]').count();
    report.activeAfterScroll = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent?.slice(0, 80),
    }));
    await scroller.evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.locator('[data-task="task-0"] button').waitFor();
    await page.locator('[data-task="task-0"] button').click();
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    await page.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Enter');
    try {
      await page.waitForFunction(() => document.activeElement?.textContent === 'Task 0', {
        timeout: 4000,
      });
      report.drawerFocusRestored = true;
    } catch {
      report.drawerFocusRestored = false;
    }
    await scroller.evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.locator('[data-task="task-0"]').waitFor();
    const box = await page.locator('[data-task="task-0"]').boundingBox();
    const drop = await page.locator('#drop').boundingBox();
    if (!box || !drop) throw new Error('Missing bounds');
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 35, box.y + box.height / 2 + 20, { steps: 8 });
    await page.waitForFunction(
      () => document.querySelector('#events')?.textContent?.includes('dragstart'),
      { timeout: 3000 },
    );
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    report.dragSourceMounted = await page.locator('[data-task="task-0"]').count();
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    report.dragEvents = await page.locator('#events').textContent();
    report.rowsAfterDrag = await page.locator('[data-task]').count();
    assert.ok(report.initialRows < 40 && report.endRows < 40);
    assert.equal(report.focusedTaskMounted, 0);
    assert.equal(report.activeAfterScroll.tag, 'BODY');
    assert.equal(report.drawerFocusRestored, true);
    assert.equal(report.dragSourceMounted, 0);
    assert.equal(report.dragEvents, 'dragstart drop:task-0');
    console.log(JSON.stringify(report));
  } catch (e) {
    console.log(JSON.stringify({ ...report, error: String(e).slice(0, 500) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
