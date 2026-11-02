# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> owner invites by email, recipient accepts with EDITOR, reuse cannot restore removed membership
- Location: testing/browser/journeys.spec.ts:160:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('status')
Expected: "Invitation accepted. Your role is EDITOR."
Error: strict mode violation: getByRole('status') resolved to 2 elements:
    1) <div role="status" class="shell-connection" aria-label="Server connected">…</div> aka getByRole('status', { name: 'Server connected' })
    2) <p role="status"></p> aka getByRole('status').filter({ hasText: /^$/ })

Call log:
  - Expect "toHaveText" with timeout 15000ms
  - waiting for getByRole('status')

```

# Test source

```ts
  90  |     const member = members.find((item) => item.user.email === 'sample-editor@devsync.invalid');
  91  |     if (!member) throw new Error('Seeded editor membership missing');
  92  |     expect(
  93  |       (await owner.request.delete(`${api}/api/workspaces/${workspace}/members/${member.id}`)).ok(),
  94  |     ).toBe(true);
  95  |     await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false', {
  96  |       timeout: 5000,
  97  |     });
  98  |     expect((await editor.request.get(`${api}/api/documents/${document}`)).status()).toBe(403);
  99  |     expect(
  100 |       (
  101 |         await owner.request.post(`${api}/api/workspaces/${workspace}/invite`, {
  102 |           data: { email: member.user.email, role: 'EDITOR' },
  103 |         })
  104 |       ).ok(),
  105 |     ).toBe(true);
  106 |   } finally {
  107 |     await owner.close();
  108 |     await editor.close();
  109 |   }
  110 | });
  111 | test('owner moves a Kanban card and saves a snippet', async ({ page, context }) => {
  112 |   await login(context, 'owner');
  113 |   const response = await context.request.post(
  114 |     `${api}/api/tasks/boards/devsync-sample-board/columns`,
  115 |     { data: { name: 'Browser target' } },
  116 |   );
  117 |   expect(response.ok()).toBe(true);
  118 |   const target = z.object({ id: z.string() }).parse(await response.json());
  119 |   await page.goto(`/workspace/${workspace}/kanban`);
  120 |   const moved = page.waitForResponse(
  121 |     (response) =>
  122 |       response.url().endsWith('/tasks/devsync-sample-task/move') &&
  123 |       response.request().method() === 'PATCH',
  124 |   );
  125 |   await page
  126 |     .locator('[draggable="true"]')
  127 |     .filter({ hasText: 'Review workspace permissions' })
  128 |     .dragTo(
  129 |       page
  130 |         .locator('div.w-72')
  131 |         .filter({ has: page.getByRole('heading', { name: 'Browser target', exact: true }) }),
  132 |     );
  133 |   expect((await moved).ok()).toBe(true);
  134 |   const boards = z
  135 |     .array(
  136 |       z.object({
  137 |         columns: z.array(
  138 |           z.object({ id: z.string(), tasks: z.array(z.object({ id: z.string() })) }),
  139 |         ),
  140 |       }),
  141 |     )
  142 |     .parse(await (await context.request.get(`${api}/api/workspaces/${workspace}/boards`)).json());
  143 |   expect(
  144 |     boards[0].columns
  145 |       .find((column) => column.id === target.id)
  146 |       ?.tasks.some((task) => task.id === 'devsync-sample-task'),
  147 |   ).toBe(true);
  148 |   await page.goto(`/workspace/${workspace}/snippets`);
  149 |   await page.getByRole('button', { name: 'Save New Snippet' }).click();
  150 |   const title = `Browser snippet ${Date.now()}`;
  151 |   await page.getByPlaceholder('e.g., useDebounce Hook').fill(title);
  152 |   await page.getByPlaceholder('// Paste or write code here...').fill('const browserProof = true;');
  153 |   await page.getByRole('button', { name: 'Save to Vault' }).click();
  154 |   await expect(page.getByText(title, { exact: true })).toBeVisible();
  155 |   await page.reload();
  156 |   await expect(page.getByText(title, { exact: true })).toBeVisible();
  157 | });
  158 | 
  159 | for (const role of ['EDITOR', 'VIEWER'] as const) {
  160 |   test(`owner invites by email, recipient accepts with ${role}, reuse cannot restore removed membership`, async ({
  161 |     browser,
  162 |   }) => {
  163 |     const owner = await browser.newContext(),
  164 |       recipient = await browser.newContext();
  165 |     try {
  166 |       await login(owner, 'owner');
  167 |       await login(recipient, role === 'EDITOR' ? 'editor' : 'viewer');
  168 |       const created = await owner.request.post(`${api}/api/workspaces`, {
  169 |         data: { name: `Invitation ${role} ${Date.now()}` },
  170 |       });
  171 |       expect(created.status()).toBe(201);
  172 |       const workspaceId = z.object({ id: z.string() }).parse(await created.json()).id;
  173 |       expect((await recipient.request.get(`${api}/api/workspaces/${workspaceId}`)).status()).toBe(
  174 |         403,
  175 |       );
  176 |       const page = await owner.newPage();
  177 |       await page.goto(`/workspace/${workspaceId}`);
  178 |       await page.getByRole('button', { name: 'Invite Member', exact: true }).first().click();
  179 |       await page
  180 |         .getByPlaceholder('teammate@company.com')
  181 |         .fill(`sample-${role.toLowerCase()}@devsync.invalid`);
  182 |       await page.getByRole('combobox').selectOption(role);
  183 |       await page.getByRole('button', { name: 'Create Invitation', exact: true }).click();
  184 |       const link = await page.locator('a[href*="/invitations/"]').getAttribute('href');
  185 |       if (!link) throw new Error('Invitation link missing');
  186 |       const invitationId = link.split('/').pop();
  187 |       const accept = await recipient.newPage();
  188 |       await accept.goto(link);
  189 |       await accept.getByRole('button', { name: 'Accept invitation', exact: true }).click();
> 190 |       await expect(accept.getByRole('status')).toHaveText(
      |                                                ^ Error: expect(locator).toHaveText(expected) failed
  191 |         `Invitation accepted. Your role is ${role}.`,
  192 |       );
  193 |       const members = z
  194 |         .object({
  195 |           members: z.array(
  196 |             z.object({ id: z.string(), role: z.string(), user: z.object({ email: z.string() }) }),
  197 |           ),
  198 |         })
  199 |         .parse(
  200 |           await (await owner.request.get(`${api}/api/workspaces/${workspaceId}`)).json(),
  201 |         ).members;
  202 |       const member = members.find(
  203 |         (item) => item.user.email === `sample-${role.toLowerCase()}@devsync.invalid`,
  204 |       );
  205 |       expect(member?.role).toBe(role);
  206 |       expect(
  207 |         (
  208 |           await owner.request.delete(`${api}/api/workspaces/${workspaceId}/members/${member!.id}`)
  209 |         ).ok(),
  210 |       ).toBe(true);
  211 |       const reused = await recipient.request.post(
  212 |         `${api}/api/workspaces/invitations/${invitationId}/accept`,
  213 |         { data: {} },
  214 |       );
  215 |       expect(reused.status()).toBe(400);
  216 |       expect((await recipient.request.get(`${api}/api/workspaces/${workspaceId}`)).status()).toBe(
  217 |         403,
  218 |       );
  219 |     } finally {
  220 |       await owner.close();
  221 |       await recipient.close();
  222 |     }
  223 |   });
  224 | }
  225 | test('invitation recipient binding, expiry, revocation, payload validation and concurrent acceptance', async ({
  226 |   browser,
  227 | }) => {
  228 |   const owner = await browser.newContext(),
  229 |     editor = await browser.newContext(),
  230 |     viewer = await browser.newContext();
  231 |   const adminUrl = process.env.E2E_ADMIN_DATABASE_URL;
  232 |   if (!adminUrl || !new URL(adminUrl).pathname.startsWith('/devsync_e2e_'))
  233 |     throw new Error('Isolated invitation clock fixture required');
  234 |   const admin = new PrismaClient({ datasourceUrl: adminUrl });
  235 |   try {
  236 |     await login(owner, 'owner');
  237 |     await login(editor, 'editor');
  238 |     await login(viewer, 'viewer');
  239 |     const workspaceId = z.object({ id: z.string() }).parse(
  240 |       await (
  241 |         await owner.request.post(`${api}/api/workspaces`, {
  242 |           data: { name: `Negative invitations ${Date.now()}` },
  243 |         })
  244 |       ).json(),
  245 |     ).id;
  246 |     async function invite() {
  247 |       const response = await owner.request.post(
  248 |         `${api}/api/workspaces/${workspaceId}/invitations`,
  249 |         { data: { email: 'sample-editor@devsync.invalid', role: 'EDITOR' } },
  250 |       );
  251 |       expect(response.status()).toBe(201);
  252 |       return z.object({ id: z.string() }).parse(await response.json()).id;
  253 |     }
  254 |     const expired = await invite();
  255 |     await admin.workspaceInvitation.update({
  256 |       where: { id: expired },
  257 |       data: { expiresAt: new Date(0) },
  258 |     });
  259 |     const page = await editor.newPage();
  260 |     await page.goto(`/invitations/${expired}`);
  261 |     await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  262 |     await expect(page.getByRole('status')).toHaveText(
  263 |       'Invitation expired, revoked or already accepted',
  264 |     );
  265 |     const revoked = await invite();
  266 |     expect(
  267 |       (
  268 |         await owner.request.delete(`${api}/api/workspaces/${workspaceId}/invitations/${revoked}`)
  269 |       ).status(),
  270 |     ).toBe(204);
  271 |     expect(
  272 |       (
  273 |         await editor.request.post(`${api}/api/workspaces/invitations/${revoked}/accept`, {
  274 |           data: {},
  275 |         })
  276 |       ).status(),
  277 |     ).toBe(400);
  278 |     const current = await invite();
  279 |     expect(
  280 |       (
  281 |         await viewer.request.post(`${api}/api/workspaces/invitations/${current}/accept`, {
  282 |           data: {},
  283 |         })
  284 |       ).status(),
  285 |     ).toBe(403);
  286 |     expect(
  287 |       (
  288 |         await editor.request.post(`${api}/api/workspaces/invitations/${current}/accept`, {
  289 |           data: { role: 'OWNER' },
  290 |         })
```