const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');

async function begin(page) {
  const handle = page.getByRole('button', { name: /^Drag Task/ }).nth(3);
  await handle.scrollIntoViewIfNeeded();
  const id = await handle.locator('xpath=ancestor::*[@data-row][1]').getAttribute('data-row');
  const box = await handle.boundingBox();
  assert.ok(id && box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 8 });
  await page.locator('[data-overlay]').waitFor();
  return id;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390])
      for (const action of ['delete', 'revoke']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.setDefaultTimeout(7000);
        try {
          await page.goto('http://127.0.0.1:3419/interruption.html');
          const host = page.getByRole('group', { name: 'Task navigation' });
          const scroller = page.locator('[data-virtuoso-scroller]');
          await scroller.evaluate((node) => {
            node.scrollTop = 4000;
          });
          await page.waitForTimeout(300);
          const draggedId = await begin(page);
          const before = await page.evaluate(() => {
            const host = document.querySelector('[aria-label="Task navigation"]');
            const scroller = document.querySelector('[data-virtuoso-scroller]');
            window.fixtureHost = host;
            window.fixtureScroller = scroller;
            return {
              scroll: scroller.scrollTop,
              rows: document.querySelectorAll('[data-row]').length,
            };
          });
          await page.evaluate(
            (detail) => window.dispatchEvent(new CustomEvent('fixture-interrupt', { detail })),
            action,
          );
          await page.locator('main[data-epoch="1"]').waitFor();
          await page.waitForFunction(() => document.activeElement === window.fixtureHost);
          await page.mouse.up();
          await page.waitForTimeout(250);
          const after = await page.evaluate(() => {
            const host = document.querySelector('[aria-label="Task navigation"]');
            const scroller = document.querySelector('[data-virtuoso-scroller]');
            const active = host.getAttribute('aria-activedescendant');
            return {
              sameHost: host === window.fixtureHost,
              sameScroller: scroller === window.fixtureScroller,
              scroll: scroller.scrollTop,
              rows: document.querySelectorAll('[data-row]').length,
              focus: document.activeElement === host,
              activeValid: !active || !!document.getElementById(active),
              announcement: document.querySelector('p[role="status"]').textContent,
            };
          });
          assert.equal(after.sameHost, true);
          assert.equal(after.sameScroller, true);
          assert.equal(after.focus, true);
          assert.equal(after.activeValid, true);
          assert.ok(before.rows < 40 && after.rows < 40);
          assert.ok(Math.abs(after.scroll - before.scroll) <= 150);
          assert.equal(await page.locator('[data-overlay]').count(), 0);
          assert.equal(await page.locator('main').getAttribute('data-moves'), '0');
          if (action === 'delete')
            assert.notEqual(await page.locator('main').getAttribute('data-active'), draggedId);
          else {
            assert.equal(await page.getByRole('button', { name: /^Drag Task/ }).count(), 0);
            await page.evaluate(() =>
              window.dispatchEvent(new CustomEvent('fixture-interrupt', { detail: 'restore' })),
            );
            await page
              .getByRole('button', { name: /^Drag Task/ })
              .first()
              .waitFor();
          }
          await begin(page);
          await page.keyboard.press('Escape');
          await page.mouse.up();
          await page.locator('[data-overlay]').waitFor({ state: 'detached' });
          await page.waitForFunction(() => document.activeElement === window.fixtureHost);
          const previousActive = await page.locator('main').getAttribute('data-active');
          await host.press('ArrowDown');
          await page.waitForFunction(
            (previous) => document.querySelector('main')?.getAttribute('data-active') !== previous,
            previousActive,
          );
          const activeValid = await host.evaluate((node) => {
            const id = node.getAttribute('aria-activedescendant');
            return !id || !!document.getElementById(id);
          });
          assert.equal(activeValid, true);
          const move = page.getByRole('combobox', { name: /^Move Task/ }).first();
          await move.focus();
          await page.keyboard.press('Space');
          await page.getByRole('option', { name: 'Done' }).waitFor();
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
          await page.locator('main[data-moves="1"]').waitFor();
          console.log(
            JSON.stringify({
              width,
              action,
              draggedId,
              before,
              after,
              secondDragCancelled: true,
              keyboardNavigation: true,
              keyboardMove: true,
            }),
          );
        } catch (error) {
          console.log(JSON.stringify({ width, action, error: String(error) }));
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
