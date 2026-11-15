const assert = require('node:assert/strict');
const { chromium } = require('/home/kevin/devsync/backend/node_modules/@playwright/test');

async function run(width) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(7000);
  const result = { width, fixtureTasks: 1000 };
  try {
    await page.goto('http://127.0.0.1:3419/');
    const grid = page.getByRole('grid', { name: 'Kanban tasks' });
    await grid.waitFor();
    await page.addScriptTag({
      path: '/home/kevin/devsync/frontend/node_modules/axe-core/axe.min.js',
    });
    result.axe = await page.evaluate(async () => {
      const report = await window.axe.run(document);
      return {
        violations: report.violations.map((item) => ({
          id: item.id,
          targets: item.nodes.map((node) => node.target),
        })),
        incomplete: report.incomplete.map((item) => item.id),
      };
    });
    result.rowsAtStart = await page.locator('[data-task-id]').count();
    assert.ok(result.rowsAtStart > 0 && result.rowsAtStart < 40);

    await page.keyboard.press('Tab');
    assert.equal(await grid.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      () =>
        document.querySelector('[role="grid"]')?.getAttribute('aria-activedescendant') ===
        'kanban-row-fixture-task-1',
    );
    result.announcement = await page.locator('p[role="status"]').textContent();
    assert.match(result.announcement ?? '', /Task 2, task 2 of 1000/);
    await page.keyboard.press('Enter');
    const task2 = page.getByRole('button', { name: 'Task 2', exact: true });
    assert.equal(await task2.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    const move2 = page.getByRole('combobox', { name: 'Move Task 2' });
    assert.equal(await move2.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    const task3 = page.getByRole('button', { name: 'Task 3', exact: true });
    assert.equal(await task3.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await move2.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await task2.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    const move1 = page.getByRole('combobox', { name: 'Move Task 1' });
    assert.equal(await move1.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    const task1ForTab = page.getByRole('button', { name: 'Task 1', exact: true });
    assert.equal(await task1ForTab.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await grid.evaluate((el) => el === document.activeElement), true);

    await grid.evaluate((el) => {
      document.querySelector('[aria-label="Task 2"]')?.focus();
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(() => document.querySelector('[data-task-id="fixture-task-999"]'));
    result.rowsAtEnd = await page.locator('[data-task-id]').count();
    result.activeDescendantOffscreen = await grid.getAttribute('aria-activedescendant');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'grid');
    result.focusAfterFocusedRowUnmount = await grid.evaluate((el) => el === document.activeElement);
    assert.equal(result.focusAfterFocusedRowUnmount, true);
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY');

    await page.getByRole('button', { name: 'After task list' }).focus();
    await page.keyboard.press('Shift+Tab');
    result.shiftTabReturnsToTaskControl = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Move Task 1000',
    );
    result.shiftTabTarget = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      role: document.activeElement?.getAttribute('role'),
      label: document.activeElement?.getAttribute('aria-label'),
      text: document.activeElement?.textContent,
    }));
    if (!result.shiftTabReturnsToTaskControl)
      console.log(JSON.stringify({ width, shiftTabTarget: result.shiftTabTarget }));
    assert.equal(result.shiftTabReturnsToTaskControl, true);
    const moveLast = page.getByRole('combobox', { name: 'Move Task 1000' });
    await moveLast.focus();
    await page.keyboard.press('Space');
    await page.getByRole('option', { name: 'Done' }).waitFor();
    result.radixOpenFocus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      role: document.activeElement?.getAttribute('role'),
      text: document.activeElement?.textContent,
    }));
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => {
      const current = document.activeElement;
      return (
        current?.getAttribute('role') === 'option' &&
        current.textContent === 'Done' &&
        current.hasAttribute('data-highlighted')
      );
    });
    result.radixAfterArrowDown = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      role: document.activeElement?.getAttribute('role'),
      text: document.activeElement?.textContent,
      options: Array.from(document.querySelectorAll('[role="option"]')).map((option) => ({
        text: option.textContent,
        selected: option.getAttribute('aria-selected'),
        highlighted: option.hasAttribute('data-highlighted'),
      })),
    }));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    result.radixMovedTaskUnmounted = !(await page
      .locator('[data-task-id="fixture-task-999"]')
      .count());
    result.radixMoveRemovedTaskWithoutBodyFocus =
      (await grid.evaluate((el) => el === document.activeElement)) &&
      (await page.evaluate(() => document.activeElement?.tagName)) !== 'BODY';
    result.rowsAfterRadixMove = await page.locator('[data-task-id]').count();
    result.announcementAfterRadixMove = await page.locator('p[role="status"]').textContent();
    result.activeIdAfterRadixMove = await page.locator('main').getAttribute('data-active-task');
    result.lastMove = await page.locator('main').getAttribute('data-last-move');
    result.todoTasksAfterMove = Number(
      await page.locator('main').getAttribute('data-visible-task-count'),
    );
    result.doneTasksAfterMove = Number(
      await page.locator('main').getAttribute('data-done-task-count'),
    );
    result.radixMoveFocusTarget = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      role: document.activeElement?.getAttribute('role'),
      label: document.activeElement?.getAttribute('aria-label'),
    }));
    result.ariaActivedescendantValid = await grid.evaluate((el) => {
      const activeId = el.getAttribute('aria-activedescendant');
      if (!activeId) return true;
      const activeElement = document.getElementById(activeId);
      return !!activeElement && el.contains(activeElement);
    });
    result.axeAfterMove = await page.evaluate(async () => {
      const report = await window.axe.run(document);
      return {
        violations: report.violations.map((item) => item.id),
        incomplete: report.incomplete.map((item) => item.id),
      };
    });
    // Return to a mounted row for Drawer assertions.
    await grid.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.getByRole('button', { name: 'Task 1', exact: true }).waitFor();
    result.orderAfterMove = await page
      .locator('[data-task-id]')
      .evaluateAll((rows) => rows.slice(0, 3).map((row) => row.getAttribute('data-task-id')));
    assert.deepEqual(result.orderAfterMove, ['fixture-task-0', 'fixture-task-1', 'fixture-task-2']);

    await page.getByRole('button', { name: 'Task 1', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Task 1',
    );
    result.drawerRestoredTaskTrigger = true;

    await page.getByRole('button', { name: 'Task 2', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.getByRole('button', { name: 'Move task out of this list' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
    result.drawerMovedTaskFallback = true;

    await page.getByRole('button', { name: 'Task 3', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.getByRole('button', { name: 'Delete fixture task' }).click();
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
    result.drawerDeletedTaskFallback = true;

    await page.getByRole('button', { name: 'Task 4', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    await page.getByRole('button', { name: 'Revoke this task access' }).click();
    await page.waitForFunction(() =>
      document.querySelector('p[role="status"]')?.textContent?.includes('access revoked'),
    );
    result.revokedResourceRows = await page.locator('[data-task-id]').count();
    result.revokedDrawerClosed = (await page.getByRole('dialog').count()) === 0;
    assert.equal(result.revokedResourceRows, 0);
    assert.equal(result.revokedDrawerClosed, true);

    await page.reload();
    await page.getByRole('button', { name: 'Switch to viewer' }).click();
    result.viewerMoveControls = await page.getByRole('combobox', { name: /Move Task/ }).count();
    await page.getByRole('button', { name: 'Task 1', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task details' }).waitFor();
    result.viewerMoveDisabled = await page
      .getByRole('button', { name: 'Move task out of this list' })
      .isDisabled();
    result.viewerDeleteDisabled = await page
      .getByRole('button', { name: 'Delete fixture task' })
      .isDisabled();
    await page.getByRole('button', { name: 'Close' }).click();
    assert.equal(result.viewerMoveControls, 0);
    assert.equal(result.viewerMoveDisabled, true);
    assert.equal(result.viewerDeleteDisabled, true);

    result.rowsAfterInteractions = await page.locator('[data-task-id]').count();
    assert.ok(
      result.rowsAtEnd < 40 && result.rowsAfterRadixMove < 40 && result.rowsAfterInteractions < 40,
    );
    assert.deepEqual(result.axe.violations, []);
    assert.deepEqual(result.axeAfterMove.violations, []);
    assert.equal(result.radixMovedTaskUnmounted, true);
    assert.equal(result.radixMoveRemovedTaskWithoutBodyFocus, true);
    assert.equal(result.ariaActivedescendantValid, true);
    assert.equal(result.todoTasksAfterMove, 999);
    assert.equal(result.doneTasksAfterMove, 1);
    assert.match(result.announcementAfterRadixMove ?? '', /Task 999, task 999 of 999/);
    console.log(JSON.stringify(result));
    return result;
  } finally {
    await browser.close();
  }
}

(async () => {
  const desktop = await run(1440);
  const mobile = await run(390);
  if (
    !desktop.radixMoveRemovedTaskWithoutBodyFocus ||
    !mobile.radixMoveRemovedTaskWithoutBodyFocus ||
    !desktop.radixMovedTaskUnmounted ||
    !mobile.radixMovedTaskUnmounted
  ) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error.stack ?? String(error).slice(0, 800));
  process.exitCode = 1;
});
