import { test, expect } from '@playwright/test';
import { login } from './identities';
test('fixture-only lifecycle plans, export confirmation and atomic ownership transfer', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    viewer = await browser.newContext();
  const api = 'http://127.0.0.1:5501/api/v1';
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');
    const created = await owner.request.post(`${api}/workspaces`, {
      data: { name: 'Lifecycle browser fixture' },
    });
    expect(created.status()).toBe(201);
    const workspace = await created.json();
    const recipient = await (await viewer.request.get(`${api}/auth/me`)).json();
    const invitation = await (
      await owner.request.post(`${api}/workspaces/${workspace.id}/invitations`, {
        data: { email: recipient.email, role: 'VIEWER' },
      })
    ).json();
    const guest = await viewer.newPage();
    await guest.goto(`/invitations/${invitation.id}`);
    await guest.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(guest.getByText('Invitation accepted. Your role is VIEWER.')).toBeVisible();
    await guest.goto(`/workspace/${workspace.id}/settings`);
    await expect(
      guest.getByText(
        'Only workspace owners can change roles, remove members or manage invitations.',
        { exact: false },
      ),
    ).toBeVisible();
    await expect(guest.getByText('Workspace setup & lifecycle')).toHaveCount(0);
    const page = await owner.newPage();
    await page.goto(`/workspace/${workspace.id}/settings`);
    await page.getByText('Workspace setup & lifecycle', { exact: true }).click();
    await page.getByRole('button', { name: 'Request workspace export' }).click();
    await expect(page.getByRole('button', { name: 'Record export request' })).toBeDisabled();
    await page.getByLabel('Confirm workspace name').fill(workspace.name);
    await page.getByRole('button', { name: 'Record export request' }).click();
    await expect(page.getByText(/No file, email or export job was generated/)).toBeVisible();
    await page.getByRole('combobox', { name: 'New workspace owner' }).click();
    await page
      .getByRole('option', { name: recipient.name || recipient.email, exact: true })
      .click();
    await page.getByRole('button', { name: 'Transfer ownership', exact: true }).click();
    await page.getByLabel('Confirm workspace name').fill(workspace.name);
    await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
    await expect(page.getByText('You have editor access.', { exact: false })).toBeVisible();
    const v2 = 'http://127.0.0.1:5501/api/v2';
    expect((await owner.request.get(`${v2}/workspaces/${workspace.id}/lifecycle`)).status()).toBe(
      403,
    );
    expect((await viewer.request.get(`${v2}/workspaces/${workspace.id}/lifecycle`)).status()).toBe(
      200,
    );
    await guest.goto('/settings');
    await expect(guest.getByRole('heading', { name: 'Account deletion plan' })).toBeVisible();
    await expect(guest.getByText(/only active owner/)).toBeVisible();
    await expect(
      guest.getByText(
        'Clerk session details are unavailable. No successful provider check is implied.',
      ),
    ).toBeVisible();
  } finally {
    await owner.close();
    await viewer.close();
  }
});
