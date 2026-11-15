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
    const task = page.locator('[data-task="task-0"]');
    await task.waitFor();
    const scroller = page.locator('[data-virtuoso-scroller="true"]');
    const box = await task.boundingBox();
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 35, box.y + box.height / 2 + 20, { steps: 8 });
    await page.waitForFunction(() =>
      document.querySelector('#events')?.textContent?.includes('dragstart'),
    );
    await scroller.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.locator('[data-task="task-999"]').waitFor();
    report.sourceMountedAfterScroll = await task.count();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(200);
    report.eventsAfterCancel = await page.locator('#events').textContent();
    await scroller.evaluate((e) => {
      e.scrollTop = 0;
    });
    await task.waitFor();
    report.taskStillMarkedDragging = (await task.textContent()).includes('dragging');
    report.renderedRows = await page.locator('[data-task]').count();
    assert.equal(report.sourceMountedAfterScroll, 0);
    assert.equal(report.eventsAfterCancel, 'dragstart');
    assert.equal(report.taskStillMarkedDragging, true);
    console.log(JSON.stringify(report));
  } catch (e) {
    console.log(JSON.stringify({ ...report, error: String(e).slice(0, 500) }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
