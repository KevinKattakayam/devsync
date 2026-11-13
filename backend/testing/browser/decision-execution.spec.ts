import { test, expect } from '@playwright/test';
import { randomBytes, createHmac } from 'crypto';
import { login } from './identities';
test('links task and signed local PR fixture with owner/viewer visibility', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await login(context, 'owner');
    const workspace = 'devsync-sample',
      base = `http://127.0.0.1:5501/api/v2/workspaces/${workspace}/decisions`;
    const sourceResponse = await context.request.get(
      `${base}/source?kind=document&id=devsync-sample-doc`,
    );
    expect(sourceResponse.status()).toBe(200);
    const source: { id: string; revision: string; title: string } = await sourceResponse.json();
    const create = await context.request.post(base, {
      data: {
        title: 'Execution browser fixture',
        rationale: 'Record the delivery trail',
        sourceKind: 'document',
        sourceId: source.id,
        sourceRevision: source.revision,
        excerpt: source.title,
      },
    });
    expect(create.status()).toBe(201);
    const receipt: { id: string } = await create.json();
    expect(
      (
        await context.request.post(`${base}/${receipt.id}/accept`, { data: { revision: 0 } })
      ).status(),
    ).toBe(200);
    const secret = randomBytes(32).toString('hex');
    const repository = await context.request.post(
      `http://127.0.0.1:5501/api/v1/workspaces/${workspace}/github-repositories`,
      {
        data: {
          repositoryId: '1234567',
          installationId: '456',
          owner: 'fixture',
          name: 'timeline',
          webhookSecret: secret,
        },
      },
    );
    expect(repository.status()).toBe(201);
    const payload = JSON.stringify({
      repository: { id: '1234567' },
      action: 'closed',
      pull_request: {
        number: 7,
        title: 'Fixture PR',
        merged: true,
        updated_at: '2026-11-08T10:00:00Z',
        head: { sha: 'a'.repeat(40) },
      },
    });
    const webhook = await context.request.post('http://127.0.0.1:5501/api/v1/webhooks/github', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'timeline-fixture',
        'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`,
      },
    });
    expect(webhook.status()).toBe(202);
    const page = await context.newPage();
    await page.goto(`/workspace/${workspace}/decisions`);
    const card = page.getByRole('article', { name: 'Execution browser fixture' });
    await card.getByRole('button', { name: 'Load execution timeline' }).click();
    await card.getByLabel('Evidence description').fill('Reviewed fixture delivery');
    await card.getByRole('button', { name: 'Record evidence' }).click();
    const evidenceList = card.getByRole('list', { name: 'Execution evidence and links' });
    await expect(evidenceList.getByText('Human assertion', { exact: true })).toBeVisible();
    await expect(
      evidenceList.getByText('Reviewed fixture delivery', { exact: true }),
    ).toBeVisible();
    await expect(evidenceList.getByText(/Occurred/)).toBeVisible();
    await card.getByLabel('Evidence type').selectOption('linked_task');
    await expect(card.getByRole('option', { name: 'Review workspace permissions' })).toBeAttached();
    await card
      .getByRole('combobox', { name: 'Task', exact: true })
      .selectOption({ label: 'Review workspace permissions' });
    await card.getByLabel('Evidence description').fill('Tracked local task');
    await card.getByRole('button', { name: 'Record evidence' }).click();
    await expect(evidenceList.getByText('Linked task', { exact: true })).toBeVisible();
    await expect(evidenceList.getByText('Tracked local task', { exact: true })).toBeVisible();
    await card.getByLabel('Evidence type').selectOption('linked_pull_request');
    await expect(card.getByRole('option', { name: 'fixture/timeline' })).toBeAttached();
    await card
      .getByRole('combobox', { name: 'Repository', exact: true })
      .selectOption({ label: 'fixture/timeline' });
    await card.getByLabel('Pull request number').fill('7');
    await card.getByLabel('Evidence description').fill('Fixture PR reference');
    await card.getByRole('button', { name: 'Record evidence' }).click();
    await expect(card.getByText(/Signed webhook record: PR merged/)).toBeVisible();
    await expect(card.getByText(/No deployment is inferred or verified here/)).toBeVisible();
    const viewer = await browser.newContext();
    try {
      await login(viewer, 'viewer');
      const viewerPage = await viewer.newPage();
      await viewerPage.goto(`/workspace/${workspace}/decisions`);
      const viewerCard = viewerPage.getByRole('article', { name: 'Execution browser fixture' });
      await viewerCard.getByRole('button', { name: 'Load execution timeline' }).click();
      await expect(viewerCard.getByText(/Tracked local task/)).toBeVisible();
      await expect(viewerCard.getByText(/Fixture PR reference/)).toHaveCount(0);
    } finally {
      await viewer.close();
    }
  } finally {
    await context.close();
  }
});
