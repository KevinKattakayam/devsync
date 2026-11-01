import { test, expect, BrowserContext } from '@playwright/test';
import { z } from 'zod';

const api = 'http://127.0.0.1:5501';
const workspace = 'devsync-sample';
const document = 'devsync-sample-doc';
async function login(context: BrowserContext, role: 'owner' | 'editor' | 'viewer') {
  const secret = process.env.E2E_RUN_SECRET;
  if (!secret) throw new Error('Missing isolated browser run capability');
  // Node fetch keeps the run capability out of Playwright request/trace instrumentation.
  const response = await fetch(`${api}/__test/login`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'x-e2e-run-secret': secret },
    body: JSON.stringify({ email: `sample-${role}@devsync.invalid` }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error('Fixture login did not issue a cookie');
  const split = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
  expect((await context.request.get(`${api}/api/auth/me`)).status()).toBe(200);
}
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
