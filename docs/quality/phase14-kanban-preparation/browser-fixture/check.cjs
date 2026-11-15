const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');

async function start(page) {
  const card = page.getByRole('group', { name: 'Fixture task' });
  await card.waitFor();
  const box = await card.boundingBox();
  if (!box) throw new Error('Missing card bounds');
  await page.mouse.move(box.x + box.width - 8, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 35, box.y + 35, { steps: 8 });
  await page.locator('[data-status="dragstart"]').waitFor();
}
async function drop(page) {
  const box = await page.locator('[data-column="done"]').boundingBox();
  if (!box) throw new Error('Missing destination bounds');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 15, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
async function change(page, action) {
  await page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('fixture-change', { detail })),
    action,
  );
  if (action === 'delete')
    await page.getByRole('group', { name: 'Fixture task' }).waitFor({ state: 'detached' });
  if (action === 'update') await page.getByRole('group', { name: 'Updated task' }).waitFor();
  if (action === 'revoke')
    await page.getByRole('combobox', { name: 'Move Fixture task' }).waitFor({ state: 'detached' });
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(6000);
      const result = { width };
      try {
        await page.goto('http://127.0.0.1:3423/');
        await page.getByRole('button', { name: 'Fixture task' }).waitFor();
        await page.addScriptTag({
          path: '/home/kevin/devsync/frontend/node_modules/axe-core/axe.min.js',
        });
        result.axe = await page.evaluate(async () => {
          const r = await window.axe.run(document);
          return {
            violations: r.violations.map((v) => v.id),
            incomplete: r.incomplete.map((v) => v.id),
          };
        });
        assert.deepEqual(result.axe.violations, []);
        const trigger = page.getByRole('button', { name: 'Fixture task' });
        await trigger.click();
        await page.getByRole('dialog', { name: 'Task details' }).waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.textContent === 'Fixture task');
        result.drawerFocusRestored = true;
        const move = page.getByRole('combobox', { name: 'Move Fixture task' });
        await move.focus();
        await page.keyboard.press('Space');
        await page.getByRole('option', { name: 'Done' }).waitFor();
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[role=option]')].some(
            (e) => e.textContent === 'Done' && e.hasAttribute('data-highlighted'),
          ),
        );
        await page.keyboard.press('Enter');
        await page.locator('[data-status="moved:Fixture task:0"]').waitFor();
        result.keyboardMove = true;
        await page.reload();
        await start(page);
        await drop(page);
        result.pointerDrop = await page.locator('[role=status]').getAttribute('data-status');
        assert.equal(result.pointerDrop, 'moved:Fixture task:0');
        await page.reload();
        await start(page);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.waitForTimeout(300);
        await page.locator('[data-status="cancelled"]').waitFor();
        result.escapeStatus = await page.locator('[role=status]').getAttribute('data-status');
        result.escapeDoneTasks = await page.locator('[data-column=done] [role=group]').count();
        assert.equal(result.escapeStatus, 'cancelled');
        assert.equal(result.escapeDoneTasks, 0);
        await start(page);
        await drop(page);
        result.dragAfterCancellation = await page
          .locator('[role=status]')
          .getAttribute('data-status');
        assert.equal(result.dragAfterCancellation, 'moved:Fixture task:0');
        for (const action of ['delete', 'revoke', 'update']) {
          await page.reload();
          await start(page);
          await change(page, action);
          await drop(page);
          result[action] = {
            status: await page.locator('[role=status]').getAttribute('data-status'),
            doneTasks: await page.locator('[data-column=done] [role=group]').count(),
          };
          if (action === 'update')
            assert.deepEqual(result[action], { status: 'moved:Updated task:7', doneTasks: 1 });
          else {
            assert.equal(result[action].doneTasks, 0);
            assert.notEqual(result[action].status, 'moved:Fixture task:0');
          }
        }
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
