import { expect, test } from '@playwright/test';

const workspaceId = process.env.E2E_WORKSPACE_ID;

test.describe('local-first workspace flow', () => {
  test.skip(!workspaceId || !process.env.E2E_STORAGE_STATE, 'Requires a Clerk-authenticated E2E_STORAGE_STATE and seeded E2E_WORKSPACE_ID');

  test('creates, completes, and persists an AI task summary document', async ({ page }) => {
    // Auth state is captured through Clerk's supported E2E setup, never typed
    // into the test or stored in source control.
    await page.goto(`/workspace/${workspaceId}/kanban`);
    await expect(page.getByRole('heading', { name: /main board/i })).toBeVisible();

    const title = `E2E local-first ${Date.now()}`;
    const todoColumn = page.locator('div').filter({ has: page.getByRole('heading', { name: 'To Do', exact: true }) }).first();
    await todoColumn.getByRole('button').click();
    await page.getByPlaceholder('Task title...').fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const task = page.getByText(title, { exact: true });
    await task.dragTo(page.locator('div').filter({ has: page.getByRole('heading', { name: 'Done', exact: true }) }).first());
    await expect(task).toBeVisible();

    // BullMQ + provider fallback are asynchronous. Poll the durable summary
    // document rather than using fixed delays.
    await page.goto(`/workspace/${workspaceId}/docs`);
    await expect(page.getByText('AI Agent Summaries', { exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByText('AI Agent Summaries', { exact: true }).click();
    await expect(page.getByText(title, { exact: false })).toBeVisible({ timeout: 45_000 });
  });
});
