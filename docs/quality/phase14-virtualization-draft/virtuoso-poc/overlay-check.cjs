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
    await page.locator('[data-task="task-0"]').waitFor({ timeout: 8000 });
    const scroller = page.locator('[data-virtuoso-scroller="true"]');
    report.initialRows = await page.locator('[data-task]').count();
    const box = await page.locator('[data-task="task-0"]').boundingBox();
    const drop = await page.locator('#drop').boundingBox();
    if (!box || !drop) throw new Error('Missing bounds');
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2 + 20, { steps: 8 });
    await page.locator('#overlay').waitFor({ timeout: 3000 });
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    report.sourceMountedAfterScroll = await page.locator('[data-task="task-0"]').count();
    report.overlayVisibleAfterScroll = await page.locator('#overlay').isVisible();
    report.scrolledRows = await page.locator('[data-task]').count();
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    report.dropEvents = await page.locator('#events').textContent();
    report.lastItem = await page.locator('[data-task]').last().getAttribute('data-task');
    await page.reload();
    await page.locator('[data-task="task-0"]').waitFor();
    const first = await page.locator('[data-task="task-0"]').boundingBox();
    await page.mouse.move(first.x + first.width - 8, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width - 30, first.y + first.height / 2 + 20, {
      steps: 8,
    });
    await page.locator('#overlay').waitFor();
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(250);
    report.cancelEvents = await page.locator('#events').textContent();
    report.overlayAfterCancel = await page.locator('#overlay').count();
    assert.ok(report.initialRows < 40 && report.scrolledRows < 40);
    assert.equal(report.sourceMountedAfterScroll, 0);
    assert.equal(report.overlayVisibleAfterScroll, true);
    assert.equal(report.dropEvents, 'start drop:task-0');
    assert.equal(report.lastItem, 'task-0');
    assert.equal(report.cancelEvents, 'start cancel');
    assert.equal(report.overlayAfterCancel, 0);
    console.log(JSON.stringify(report));
  } catch (e) {
    console.log(JSON.stringify({ ...report, error: String(e).slice(0, 500) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
