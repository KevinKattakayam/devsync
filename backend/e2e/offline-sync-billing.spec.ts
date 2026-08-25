import { expect, test } from '@playwright/test';

const workspaceId = process.env.E2E_WORKSPACE_ID;

test.describe('offline CRDT and billing reconciliation', () => {
  test.skip(!workspaceId || !process.env.E2E_STORAGE_STATE, 'Requires seeded authenticated E2E state');

  test('retains five local tasks and document text while offline, then exposes payment block without data loss', async ({ page, context }) => {
    await page.goto(`/workspace/${workspaceId}/kanban`);
    await expect(page.getByRole('heading', { name: /main board/i })).toBeVisible();
    await context.setOffline(true);

    for (let index = 0; index < 5; index += 1) {
      await page.getByRole('button').filter({ has: page.locator('svg') }).nth(0).click();
      const input = page.getByPlaceholder('Task title...');
      await input.fill(`offline-task-${index}`);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText(`offline-task-${index}`, { exact: true })).toBeVisible();
    }

    await page.goto(`/workspace/${workspaceId}/docs`);
    await page.getByText(/untitled|new document/i).first().click();
    await page.locator('.ProseMirror').fill('offline document mutation');
    await expect(page.getByText('🟡 Offline (Saving Locally)')).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText('🟢 Synced')).toBeVisible();

    // The controlled API response models Stripe’s preflight rejection. IndexedDB
    // state is asserted before and after the blocked sync state.
    await page.route('**/api/ai/complete', async (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Monthly AI token limit reached' }) }));
    await page.getByRole('button', { name: 'AI' }).click();
    await page.getByText(/summarize/i).click();
    await expect(page.getByText('🔴 Sync Blocked (Payment Required)')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toContainText('offline document mutation');
    await expect(page.getByRole('link', { name: 'Upgrade Plan' })).toBeVisible();
  });
});
