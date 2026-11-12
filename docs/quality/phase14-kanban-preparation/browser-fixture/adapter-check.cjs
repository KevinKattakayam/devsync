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
      await page.goto('http://127.0.0.1:3424/adapter.html');
      const group = page.getByRole('group', { name: 'Adapter task' });
      assert.equal(await group.getAttribute('draggable'), 'false');
      const handle = page.getByRole('button', { name: 'Drag Adapter task' });
      const box = await handle.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 45, { steps: 8 });
      await page.locator('p[role="status"]').getByText('dragging').waitFor();
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.locator('p[role="status"]').getByText('cancelled').waitFor();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: 'Revoke write' }).click();
      await handle.waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Drag Adapter task' }).count(), 0);
      console.log(
        JSON.stringify({
          width,
          pointerDrag: true,
          escapeCancelled: true,
          revokedHandleHidden: true,
          nativeDragging: false,
        }),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
