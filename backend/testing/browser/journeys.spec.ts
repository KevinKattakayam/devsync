import { login } from './identities';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const api = 'http://127.0.0.1:5501';
const workspace = 'devsync-sample';
const document = 'devsync-sample-doc';
for (const role of ['owner', 'editor', 'viewer'] as const) {
  test(`${role} signs in and signs out with server session invalidation`, async ({
    page,
    context,
  }) => {
    await login(context, role);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: new RegExp(`Sample ${role}$`) }).click();
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await context.request.get(`${api}/__test/me`)).status()).toBe(401);
  });
}
test('owner creates a workspace from the dashboard', async ({ page, context }) => {
  await login(context, 'owner');
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const name = `Browser workspace ${Date.now()}`;
  await page.getByPlaceholder('My Project').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});
test('two contexts edit the same document and both edits merge; viewer is read-only', async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    await Promise.all(
      contexts.map((context, index) =>
        login(context, (['owner', 'editor', 'viewer'] as const)[index]),
      ),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map((page) => page.goto(`/workspace/${workspace}/docs/${document}`)));
    for (const page of pages.slice(0, 2))
      await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
    await expect(pages[2].locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(pages[2].getByLabel('Document content')).toHaveAttribute('aria-readonly', 'true');
    const denied = await contexts[2].request.patch(`${api}/api/documents/${document}`, {
      data: { title: 'Viewer forbidden' },
    });
    expect(denied.status()).toBe(403);
    const edits = [`owner-${Date.now()}`, `editor-${Date.now()}`];
    await Promise.all(
      pages.slice(0, 2).map(async (page) => {
        await page.locator('.ProseMirror').click();
        await page.keyboard.press('Control+End');
      }),
    );
    await Promise.all(
      pages.slice(0, 2).map((page, index) => page.keyboard.insertText(edits[index])),
    );
    for (const page of pages)
      for (const edit of edits) await expect(page.locator('.ProseMirror')).toContainText(edit);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
test('owner removes an editor with an open document and access closes within seconds', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    editor = await browser.newContext();
  try {
    await login(owner, 'owner');
    await login(editor, 'editor');
    const page = await editor.newPage();
    await page.goto(`/workspace/${workspace}/docs/${document}`);
    await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
    const response = await owner.request.get(`${api}/api/workspaces/${workspace}`);
    const members = z
      .object({
        members: z.array(z.object({ id: z.string(), user: z.object({ email: z.string() }) })),
      })
      .parse(await response.json()).members;
    const member = members.find((item) => item.user.email === 'sample-editor@devsync.invalid');
    if (!member) throw new Error('Seeded editor membership missing');
    expect(
      (await owner.request.delete(`${api}/api/workspaces/${workspace}/members/${member.id}`)).ok(),
    ).toBe(true);
    await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false', {
      timeout: 5000,
    });
    expect((await editor.request.get(`${api}/api/documents/${document}`)).status()).toBe(403);
    expect(
      (
        await owner.request.post(`${api}/api/workspaces/${workspace}/invite`, {
          data: { email: member.user.email, role: 'EDITOR' },
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await owner.close();
    await editor.close();
  }
});
test('owner moves a Kanban card and saves a snippet', async ({ page, context }) => {
  await login(context, 'owner');
  const response = await context.request.post(
    `${api}/api/tasks/boards/devsync-sample-board/columns`,
    { data: { name: 'Browser target' } },
  );
  expect(response.ok()).toBe(true);
  const target = z.object({ id: z.string() }).parse(await response.json());
  await page.goto(`/workspace/${workspace}/kanban`);
  const moved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/tasks/devsync-sample-task/move') &&
      response.request().method() === 'PATCH',
  );
  await page
    .locator('[draggable="true"]')
    .filter({ hasText: 'Review workspace permissions' })
    .dragTo(
      page
        .locator('div.w-72')
        .filter({ has: page.getByRole('heading', { name: 'Browser target', exact: true }) }),
    );
  expect((await moved).ok()).toBe(true);
  const boards = z
    .array(
      z.object({
        columns: z.array(
          z.object({ id: z.string(), tasks: z.array(z.object({ id: z.string() })) }),
        ),
      }),
    )
    .parse(await (await context.request.get(`${api}/api/workspaces/${workspace}/boards`)).json());
  expect(
    boards[0].columns
      .find((column) => column.id === target.id)
      ?.tasks.some((task) => task.id === 'devsync-sample-task'),
  ).toBe(true);
  await page.goto(`/workspace/${workspace}/snippets`);
  await page.getByRole('button', { name: 'Save New Snippet' }).click();
  const title = `Browser snippet ${Date.now()}`;
  await page.getByPlaceholder('e.g., useDebounce Hook').fill(title);
  await page.getByPlaceholder('// Paste or write code here...').fill('const browserProof = true;');
  await page.getByRole('button', { name: 'Save to Vault' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

for (const role of ['EDITOR', 'VIEWER'] as const) {
  test(`owner invites by email, recipient accepts with ${role}, reuse cannot restore removed membership`, async ({
    browser,
  }) => {
    const owner = await browser.newContext(),
      recipient = await browser.newContext();
    try {
      await login(owner, 'owner');
      await login(recipient, role === 'EDITOR' ? 'editor' : 'viewer');
      const created = await owner.request.post(`${api}/api/workspaces`, {
        data: { name: `Invitation ${role} ${Date.now()}` },
      });
      expect(created.status()).toBe(201);
      const workspaceId = z.object({ id: z.string() }).parse(await created.json()).id;
      expect((await recipient.request.get(`${api}/api/workspaces/${workspaceId}`)).status()).toBe(
        403,
      );
      const page = await owner.newPage();
      await page.goto(`/workspace/${workspaceId}`);
      await page.getByRole('button', { name: 'Invite Member', exact: true }).first().click();
      await page
        .getByPlaceholder('teammate@company.com')
        .fill(`sample-${role.toLowerCase()}@devsync.invalid`);
      await page.getByRole('combobox').selectOption(role);
      await page.getByRole('button', { name: 'Create Invitation', exact: true }).click();
      const link = await page.locator('a[href*="/invitations/"]').getAttribute('href');
      if (!link) throw new Error('Invitation link missing');
      const invitationId = link.split('/').pop();
      const accept = await recipient.newPage();
      await accept.goto(link);
      await accept.getByRole('button', { name: 'Accept invitation', exact: true }).click();
      await expect(accept.getByRole('status')).toHaveText(
        `Invitation accepted. Your role is ${role}.`,
      );
      const members = z
        .object({
          members: z.array(
            z.object({ id: z.string(), role: z.string(), user: z.object({ email: z.string() }) }),
          ),
        })
        .parse(
          await (await owner.request.get(`${api}/api/workspaces/${workspaceId}`)).json(),
        ).members;
      const member = members.find(
        (item) => item.user.email === `sample-${role.toLowerCase()}@devsync.invalid`,
      );
      expect(member?.role).toBe(role);
      expect(
        (
          await owner.request.delete(`${api}/api/workspaces/${workspaceId}/members/${member!.id}`)
        ).ok(),
      ).toBe(true);
      const reused = await recipient.request.post(
        `${api}/api/workspaces/invitations/${invitationId}/accept`,
        { data: {} },
      );
      expect(reused.status()).toBe(400);
      expect((await recipient.request.get(`${api}/api/workspaces/${workspaceId}`)).status()).toBe(
        403,
      );
    } finally {
      await owner.close();
      await recipient.close();
    }
  });
}
test('invitation recipient binding, expiry, revocation, payload validation and concurrent acceptance', async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    editor = await browser.newContext(),
    viewer = await browser.newContext();
  const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;
  if (!adminUrl || !new URL(adminUrl).pathname.startsWith('/devsync_e2e_'))
    throw new Error('Isolated invitation clock fixture required');
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    await login(owner, 'owner');
    await login(editor, 'editor');
    await login(viewer, 'viewer');
    const workspaceId = z.object({ id: z.string() }).parse(
      await (
        await owner.request.post(`${api}/api/workspaces`, {
          data: { name: `Negative invitations ${Date.now()}` },
        })
      ).json(),
    ).id;
    async function invite() {
      const response = await owner.request.post(
        `${api}/api/workspaces/${workspaceId}/invitations`,
        { data: { email: 'sample-editor@devsync.invalid', role: 'EDITOR' } },
      );
      expect(response.status()).toBe(201);
      return z.object({ id: z.string() }).parse(await response.json()).id;
    }
    const expired = await invite();
    await admin.workspaceInvitation.update({
      where: { id: expired },
      data: { expiresAt: new Date(0) },
    });
    const page = await editor.newPage();
    await page.goto(`/invitations/${expired}`);
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Invitation expired, revoked or already accepted',
    );
    const revoked = await invite();
    expect(
      (
        await owner.request.delete(`${api}/api/workspaces/${workspaceId}/invitations/${revoked}`)
      ).status(),
    ).toBe(204);
    expect(
      (
        await editor.request.post(`${api}/api/workspaces/invitations/${revoked}/accept`, {
          data: {},
        })
      ).status(),
    ).toBe(400);
    const current = await invite();
    expect(
      (
        await viewer.request.post(`${api}/api/workspaces/invitations/${current}/accept`, {
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await editor.request.post(`${api}/api/workspaces/invitations/${current}/accept`, {
          data: { role: 'OWNER' },
        })
      ).status(),
    ).toBe(400);
    const responses = await Promise.all(
      [1, 2].map(() =>
        editor.request.post(`${api}/api/workspaces/invitations/${current}/accept`, { data: {} }),
      ),
    );
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 400]);
    const preserved = await invite();
    expect(
      (
        await editor.request.post(`${api}/api/workspaces/invitations/${preserved}/accept`, {
          data: {},
        })
      ).status(),
    ).toBe(200);
    const viewerCreate = await viewer.request.post(
      `${api}/api/workspaces/${workspaceId}/invitations`,
      { data: { email: 'sample-viewer@devsync.invalid', role: 'VIEWER' } },
    );
    expect(viewerCreate.status()).toBe(403);
  } finally {
    await admin.$disconnect();
    await Promise.all([owner.close(), editor.close(), viewer.close()]);
  }
});
