const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');

async function startDrag(page) {
  const handle = page.getByRole('button', { name: 'Drag Task 1' });
  await handle.waitFor();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing drag handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 8 });
  await page.locator('[data-overlay]').waitFor();
}

async function drop(page) {
  const box = await page.locator('[data-drop="done"]').boundingBox();
  if (!box) throw new Error('Missing destination');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(5000);
      const result = { width };
      try {
        await page.goto('http://127.0.0.1:3419/');
        await startDrag(page);
        await page.mouse.move(5, 5);
        await page.mouse.up();
        await page.locator('[data-drag-result="denied"]').waitFor();
        result.invalidDropOverlay = await page.locator('[data-overlay]').count();
        result.invalidDropDone = await page.locator('main').getAttribute('data-done-task-count');
        assert.equal(result.invalidDropOverlay, 0);
        assert.equal(result.invalidDropDone, '0');
        await page.getByRole('button', { name: 'Reject next fixture move' }).click();
        await startDrag(page);
        await drop(page);
        await page.locator('[data-drag-result="pending"]').waitFor();
        result.optimisticDone = await page.locator('main').getAttribute('data-done-task-count');
        assert.equal(result.optimisticDone, '1');
        await page.locator('[data-drag-result="rejected-rolled-back"]').waitFor();
        result.rollbackTaskPresent = await page.locator('[data-task-id="fixture-task-0"]').count();
        result.rollbackDone = await page.locator('main').getAttribute('data-done-task-count');
        assert.equal(result.rollbackTaskPresent, 1);
        assert.equal(result.rollbackDone, '0');
        await page.reload();
        await startDrag(page);
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('fixture-change', { detail: 'viewer' })),
        );
        await page.mouse.up();
        await page.getByRole('button', { name: 'Switch to editor' }).waitFor();
        await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
        result.viewerOverlay = await page.locator('[data-overlay]').count();
        result.viewerDone = await page.locator('main').getAttribute('data-done-task-count');
        assert.equal(result.viewerOverlay, 0);
        assert.equal(result.viewerDone, '0');
        await page.reload();
        await startDrag(page);
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('fixture-change', { detail: 'delete' })),
        );
        await page.mouse.up();
        await page.waitForTimeout(300);
        result.deleteState = await page
          .locator('[data-drag-result]')
          .getAttribute('data-drag-result');
        result.deleteFocus = await page.evaluate(() => document.activeElement?.tagName);
        result.deletedOverlay = await page.locator('[data-overlay]').count();
        result.deletedRows = await page.locator('[data-task-id="fixture-task-0"]').count();
        result.activeAfterDelete = await page.locator('main').getAttribute('data-active-task');
        assert.equal(result.deletedOverlay, 0);
        assert.equal(result.deleteState, 'delete');
        assert.equal(result.deleteFocus, 'H1');
        assert.equal(result.deletedRows, 0);
        assert.notEqual(result.activeAfterDelete, 'fixture-task-0');
        await page.reload();
        await startDrag(page);
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('fixture-change', { detail: 'revoke' })),
        );
        await page.mouse.up();
        await page.getByText('Workspace access revoked. Task details are unavailable.').waitFor();
        await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
        result.revokedOverlay = await page.locator('[data-overlay]').count();
        result.revokedRows = await page.locator('[data-task-id]').count();
        assert.equal(result.revokedOverlay, 0);
        assert.equal(result.revokedRows, 0);
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
