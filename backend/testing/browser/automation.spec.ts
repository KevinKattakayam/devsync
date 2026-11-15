import { test, expect } from '@playwright/test';
import { login } from './identities';
test('owner explicitly approves one activity while viewer cannot mutate or inspect executions', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const base = 'http://127.0.0.1:5501/api/v2/workspaces/devsync-sample/automation';
    expect(
      (
        await viewer.request.post(base, {
          data: {
            title: 'forbidden',
            trigger: 'task_review',
            action: 'notify',
            condition: 'always',
            debounceSeconds: 30,
          },
        })
      ).status(),
    ).toBe(403);
    expect((await viewer.request.get(`${base}/executions`)).status()).toBe(403);
    const page = await owner.newPage();
    await page.goto('/workspace/devsync-sample/settings');
    await page.getByRole('button', { name: 'Load automation rules' }).click();
    await page.getByLabel('Rule name').fill('Browser review rule');
    await page.getByRole('button', { name: 'Create disabled rule' }).click();
    await page.getByRole('button', { name: 'Enable Browser review rule' }).click();
    await page.getByRole('button', { name: 'Preview Browser review rule' }).click();
    await expect(page.getByRole('option', { name: 'Review workspace permissions' })).toHaveCount(1);
    await page
      .getByLabel('Task', { exact: true })
      .selectOption({ label: 'Review workspace permissions' });
    await page.getByRole('button', { name: 'Preview event', exact: true }).click();
    await expect(page.getByText('Eligible — owner approval is required.')).toBeVisible();
    await page.getByRole('button', { name: 'Submit event for approval' }).click();
    await expect(
      page.getByRole('button', { name: 'Approve Browser review rule execution' }),
    ).toBeVisible();
    await page.waitForTimeout(6000);
    const before = (await (await owner.request.get(`${base}/executions`)).json()) as {
      status: string;
    }[];
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe('pending_approval');
    await page.getByRole('button', { name: 'Approve Browser review rule execution' }).click();
    await expect
      .poll(
        async () =>
          (
            (await (await owner.request.get(`${base}/executions`)).json()) as { status: string }[]
          )[0]?.status,
        { timeout: 30000 },
      )
      .toBe('completed');
    await page.waitForTimeout(6000);
    expect(
      (await (await owner.request.get(`${base}/executions`)).json()) as unknown[],
    ).toHaveLength(1);
    const activity = (await (
      await owner.request.get('http://127.0.0.1:5501/api/v1/workspaces/devsync-sample/activities')
    ).json()) as { type: string }[];
    expect(activity.filter((item) => item.type === 'automation_notification')).toHaveLength(1);
  } finally {
    await owner.close();
    await viewer.close();
  }
});
