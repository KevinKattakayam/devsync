const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const result = { width };
      try {
        await page.goto('http://127.0.0.1:3419/');
        await page.locator('[data-task-id="fixture-task-0"]').waitFor();
        result.initialRows = await page.locator('[data-task-id]').count();
        const handle = page.getByRole('button', { name: 'Drag Task 1' });
        const rect = await handle.boundingBox();
        if (!rect) throw new Error('No drag handle bounds');
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width / 2 + 30, rect.y + rect.height / 2 + 20, {
          steps: 8,
        });
        await page.locator('[data-overlay]').waitFor();
        const scroller = page.locator('[data-virtuoso-scroller="true"]');
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.locator('[data-task-id="fixture-task-999"]').waitFor();
        result.sourceMounted = await page.locator('[data-task-id="fixture-task-0"]').count();
        result.scrolledRows = await page.locator('[data-task-id]').count();
        const drop = await page.locator('[data-drop="done"]').boundingBox();
        if (!drop) throw new Error('No destination bounds');
        await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        result.drop = await page.locator('[data-drag-result]').getAttribute('data-drag-result');
        result.overlayAfterDrop = await page.locator('[data-overlay]').count();
        assert.ok(result.initialRows < 40 && result.scrolledRows < 40);
        assert.equal(result.sourceMounted, 0);
        assert.equal(result.drop, 'moved');
        assert.equal(result.overlayAfterDrop, 0);
        await page.reload();
        const nextHandle = page.getByRole('button', { name: 'Drag Task 1' });
        await nextHandle.waitFor();
        const nextRect = await nextHandle.boundingBox();
        if (!nextRect) throw new Error('No cancellation handle bounds');
        await page.mouse.move(nextRect.x + nextRect.width / 2, nextRect.y + nextRect.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          nextRect.x + nextRect.width / 2 + 30,
          nextRect.y + nextRect.height / 2 + 20,
          { steps: 8 },
        );
        await page.locator('[data-overlay]').waitFor();
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.locator('[data-task-id="fixture-task-999"]').waitFor();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(200);
        result.cancel = await page.locator('[data-drag-result]').getAttribute('data-drag-result');
        result.overlayAfterCancel = await page.locator('[data-overlay]').count();
        result.focusAfterCancel = await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        );
        assert.equal(result.cancel, 'cancelled');
        assert.equal(result.overlayAfterCancel, 0);
        assert.equal(result.focusAfterCancel, 'Kanban tasks');
        console.log(JSON.stringify(result));
      } catch (error) {
        console.log(JSON.stringify({ ...result, error: String(error) }));
        process.exitCode = 1;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
