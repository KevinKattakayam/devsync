import { test, expect } from '@playwright/test';
import { randomBytes, createHmac } from 'crypto';
import { resolve } from 'path';
import { login } from './identities';
test('signed fixture PR/check trail is timestamped, owner-only and never claims deployment', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  const api = 'http://127.0.0.1:5501/api/v1',
    workspace = 'devsync-sample',
    secret = randomBytes(32).toString('hex');
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const boards = await (await owner.request.get(`${api}/workspaces/${workspace}/boards`)).json();
    const columns: { id: string; name: string }[] = boards[0].columns;
    const target = await owner.request.post(`${api}/tasks/boards/${boards[0].id}/columns`, {
      data: { name: 'CI merge target fixture' },
    });
    expect(target.status()).toBe(201);
    const done: { id: string } = await target.json();
    expect(
      (
        await owner.request.patch(`${api}/tasks/tasks/devsync-sample-task`, {
          data: { taskKey: 'CI-999' },
        })
      ).status(),
    ).toBe(200);
    const response = await owner.request.post(
      `${api}/workspaces/${workspace}/github-repositories`,
      {
        data: {
          repositoryId: '1234567',
          installationId: '456',
          owner: 'fixture',
          name: 'repository',
          webhookSecret: secret,
          prOpenedColumnId: columns[0].id,
          prMergedColumnId: done.id,
        },
      },
    );
    expect(response.status()).toBe(201);
    const repository = await response.json();
    const deliver = async (event: string, data: object, id: string) => {
      const body = JSON.stringify({ repository: { id: '1234567' }, ...data });
      return owner.request.post(`${api}/webhooks/github`, {
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': event,
          'x-github-delivery': id,
          'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
        },
      });
    };
    const merged = {
      action: 'closed',
      pull_request: {
        number: 7,
        merged: true,
        title: 'Fixes CI-999',
        updated_at: '2026-11-08T10:00:00Z',
        head: { sha: 'a'.repeat(40) },
      },
    };
    expect((await deliver('pull_request', merged, 'merge')).status()).toBe(200);
    expect((await deliver('pull_request', merged, 'merge')).status()).toBe(202);
    expect(
      (
        await deliver(
          'pull_request',
          {
            action: 'opened',
            pull_request: {
              number: 7,
              title: 'Renamed PR fixes CI-999',
              updated_at: '2026-11-08T09:00:00Z',
            },
          },
          'late-open',
        )
      ).status(),
    ).toBe(202);
    expect(
      (
        await deliver(
          'check_run',
          {
            action: 'completed',
            check_run: {
              id: 91,
              status: 'completed',
              conclusion: 'success',
              head_sha: 'a'.repeat(40),
              completed_at: '2026-11-08T10:05:00Z',
            },
          },
          'check',
        )
      ).status(),
    ).toBe(200);
    const page = await owner.newPage();
    await page.goto(`/workspace/${workspace}/settings`);
    await page.getByText('GitHub execution trail', { exact: true }).click();
    await page.getByLabel('Repository', { exact: true }).selectOption(repository.id);
    await expect(page.getByRole('link', { name: 'PR #7' })).toHaveAttribute(
      'href',
      'https://github.com/fixture/repository/pull/7',
    );
    await expect(page.getByText(/Check #91: completed/)).toBeVisible();
    await expect(page.getByText(/Deployment: unknown/)).toBeVisible();
    await expect(page.getByText('2026-11-08T10:05:00.000Z', { exact: true })).toBeVisible();
    const refreshed = await (
      await owner.request.get(`${api}/workspaces/${workspace}/boards`)
    ).json();
    expect(
      refreshed[0].columns
        .find((c: { id: string }) => c.id === done.id)
        .tasks.some((t: { id: string }) => t.id === 'devsync-sample-task'),
    ).toBe(true);
    expect(
      (
        await viewer.request.get(
          `http://127.0.0.1:5501/api/v2/workspaces/${workspace}/github-repositories/${repository.id}/execution`,
        )
      ).status(),
    ).toBe(403);
    const appSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    if (!appSecret) throw new Error('Missing isolated App fixture secret');
    const withdrawal = JSON.stringify({
      action: 'deleted',
      installation: { id: 456, app_id: 123 },
    });
    const withdrawn = await owner.request.post(
      'http://127.0.0.1:5501/api/v2/webhooks/github-installation',
      {
        data: withdrawal,
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': `sha256=${createHmac('sha256', appSecret).update(withdrawal).digest('hex')}`,
        },
      },
    );
    expect(withdrawn.status()).toBe(200);
    await page.getByRole('button', { name: 'Refresh GitHub evidence' }).click();
    await expect(page.getByText(/GitHub app disconnected/)).toBeVisible();
    await page.screenshot({
      path: resolve(__dirname, '../../../docs/quality/github-trail/browser-fixture.png'),
      fullPage: true,
      animations: 'disabled',
    });
    expect((await deliver('pull_request', merged, 'revoked-redelivery')).status()).toBe(403);
    expect(
      (
        await owner.request.delete(
          `${api}/workspaces/${workspace}/github-repositories/${repository.id}`,
        )
      ).status(),
    ).toBe(204);
    await page.getByRole('button', { name: 'Refresh GitHub evidence' }).click();
    await expect(
      page.getByRole('region', { name: 'GitHub execution evidence' }).getByRole('alert'),
    ).toContainText('unavailable');
  } finally {
    await owner.close();
    await viewer.close();
  }
});
