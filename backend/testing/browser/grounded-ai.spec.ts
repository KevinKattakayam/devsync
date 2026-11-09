import { test, expect } from '@playwright/test';
import { login } from './identities';
test('grounded preview reports unavailable provider and rejects viewer drafts', async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const viewer = await browser.newContext();
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const api = 'http://127.0.0.1:5501/api';
    const doc = await owner.request.post(`${api}/workspaces/devsync-sample/documents`, {
      data: {
        workspaceId: 'devsync-sample',
        title: 'GroundedFixture',
        content: 'Local evidence only',
      },
    });
    expect(doc.status()).toBe(201);
    const denied = await viewer.request.post(`${api}/v3/ai/grounded`, {
      data: { workspaceId: 'devsync-sample', prompt: 'GroundedFixture', purpose: 'meeting_tasks' },
    });
    expect(denied.status()).toBe(403);
    const page = await owner.newPage();
    await page.goto('/workspace/devsync-sample');
    await page.getByRole('button', { name: 'AI Copilot', exact: true }).click();
    await page.getByLabel('Evidence question').fill('GroundedFixture');
    await page.getByRole('button', { name: 'Generate evidence preview' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No work was created' })).toBeVisible();
    await expect(page.getByText('Provider cost unavailable.')).toHaveCount(0);
  } finally {
    await owner.close();
    await viewer.close();
  }
});
