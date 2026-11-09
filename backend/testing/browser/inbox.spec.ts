import { expect, test } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { login } from './identities';

test('viewer marks an authorized event read and loses cached inbox after removal', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  const api = 'http://127.0.0.1:5501/api',
    workspace = 'devsync-sample';
  const digest = `${api}/v2/workspaces/${workspace}/digest`;
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const created = await owner.request.post(`${api}/workspaces/${workspace}/documents`, {
      data: { title: 'Inbox browser fixture' },
    });
    expect(created.status()).toBe(201);
    const preference = (await (await viewer.request.get(`${digest}/preferences`)).json()) as {
      enabled: boolean;
      revision: number;
    };
    if (!preference.enabled)
      expect(
        (
          await viewer.request.put(`${digest}/preferences`, {
            data: { enabled: true, expectedRevision: preference.revision },
          })
        ).status(),
      ).toBe(200);
    const page = await viewer.newPage();
    await page.goto(`/workspace/${workspace}/inbox`);
    const row = page
      .getByRole('list', { name: 'Inbox events' })
      .getByRole('listitem')
      .filter({ hasText: 'Inbox browser fixture' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Mark read/ }).click();
    await expect(row.getByText('Read', { exact: true })).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations,
    );
    expect(violations).toEqual([]);
    const identity = (await (await viewer.request.get(`${api}/auth/me`)).json()) as {
      memberships: { id: string; workspaceId: string }[];
    };
    const membership = identity.memberships.find((item) => item.workspaceId === workspace);
    if (!membership) throw new Error('Missing seeded viewer membership');
    expect(
      (
        await owner.request.delete(`${api}/workspaces/${workspace}/members/${membership.id}`)
      ).status(),
    ).toBe(200);
    expect((await viewer.request.get(`${digest}/inbox`)).status()).toBe(403);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('list', { name: 'Inbox events' })).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'Inbox unavailable' })).toBeVisible();
  } finally {
    await owner.close();
    await viewer.close();
  }
});
