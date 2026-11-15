import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { login } from './identities';
test('acknowledged live edit is searchable without AI and source open rechecks archive and membership (fixture identities)', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  const api = 'http://127.0.0.1:5501/api/v1',
    workspace = 'devsync-sample';
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const created = await owner.request.post(`${api}/workspaces/${workspace}/documents`, {
      data: { title: 'Search browser fixture' },
    });
    expect(created.status()).toBe(201);
    const doc: { id: string } = await created.json();
    const editor = await owner.newPage(),
      search = await viewer.newPage();
    await editor.goto(`/workspace/${workspace}/docs/${doc.id}`);
    const body = editor.getByRole('textbox', { name: 'Document content', exact: true });
    await expect(body).toBeEditable();
    await body.click();
    await editor.keyboard.insertText('freshquartzbrowser live acknowledged body');
    await expect(editor.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
    await search.goto(`/workspace/${workspace}/search`);
    await search.getByLabel('Search text').fill('freshquartzbrowser');
    await search.getByRole('button', { name: 'Search knowledge', exact: true }).click();
    await expect(search.getByText('Search browser fixture', { exact: true })).toBeVisible();
    await expect(search.getByText(/freshquartzbrowser live acknowledged body/)).toBeVisible();
    await expect(search.getByText(/Current committed projection/)).toBeVisible();
    await search.getByLabel('Source type').selectOption('document');
    await search.getByLabel('Updated after (UTC)').fill('2000-01-01T00:00');
    await search.getByLabel('Updated before (UTC)').fill('2099-01-01T00:00');
    await search.getByRole('button', { name: 'Search knowledge', exact: true }).click();
    await expect(search.getByRole('button', { name: 'Open Search browser fixture' })).toBeVisible();
    await search.screenshot({
      path: resolve(__dirname, '../../../docs/quality/search-indexing/browser-fixture.png'),
      fullPage: true,
    });
    expect(
      (
        await owner.request.patch(`${api}/documents/${doc.id}`, { data: { isArchived: true } })
      ).status(),
    ).toBe(200);
    await search.getByRole('button', { name: 'Open Search browser fixture' }).click();
    await expect(search.getByRole('alert').filter({ hasText: 'Source unavailable' })).toBeVisible();
    await expect(
      search
        .getByRole('region', { name: 'Knowledge search' })
        .getByText('Search browser fixture', { exact: true }),
    ).toHaveCount(0);
    const viewerIdentity: { memberships: { id: string; workspaceId: string }[] } = await (
      await viewer.request.get(`${api}/auth/me`)
    ).json();
    const membership = viewerIdentity.memberships.find((item) => item.workspaceId === workspace);
    if (!membership) throw new Error('Missing seeded viewer membership');
    const removed = await owner.request.delete(
      `${api}/workspaces/${workspace}/members/${membership.id}`,
    );
    expect(removed.status()).toBe(200);
    expect(
      (
        await viewer.request.get(
          `http://127.0.0.1:5501/api/v2/workspaces/${workspace}/search?q=freshquartzbrowser`,
        )
      ).status(),
    ).toBe(403);
  } finally {
    await owner.close();
    await viewer.close();
  }
});
