# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> owner moves a Kanban card and saves a snippet
- Location: testing/browser/journeys.spec.ts:111:5

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: page.waitForResponse: Test timeout of 240000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to content" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "Sidebar" [ref=e4]:
      - 'button "Switch workspace: Sample workspace" [ref=e6] [cursor=pointer]':
        - generic [ref=e9]: Sample workspace
      - navigation "Workspace navigation" [ref=e12]:
        - link "All workspaces" [ref=e13] [cursor=pointer]:
          - /url: /dashboard
        - generic [ref=e20]:
          - link "Overview" [ref=e21] [cursor=pointer]:
            - /url: /workspace/devsync-sample
          - link "Documents" [ref=e28] [cursor=pointer]:
            - /url: /workspace/devsync-sample/docs
          - link "Sprint board" [ref=e33] [cursor=pointer]:
            - /url: /workspace/devsync-sample/kanban
          - link "Code snippets" [ref=e36] [cursor=pointer]:
            - /url: /workspace/devsync-sample/snippets
          - link "Settings" [ref=e42] [cursor=pointer]:
            - /url: /workspace/devsync-sample/settings
        - region "Document navigation" [ref=e47]:
          - heading "Documents" [level=2] [ref=e48]
          - list [ref=e49]:
            - listitem [ref=e50]:
              - link "Welcome" [ref=e52] [cursor=pointer]:
                - /url: /workspace/devsync-sample/docs/devsync-sample-doc
      - status "Server connected" [ref=e57]
      - generic [ref=e60]:
        - button "Collapse sidebar" [expanded] [ref=e61] [cursor=pointer]
        - generic [ref=e66]: DevSync
    - generic [ref=e67]:
      - banner [ref=e68]:
        - navigation "Breadcrumb" [ref=e69]:
          - list [ref=e70]:
            - listitem [ref=e71]:
              - link "Workspaces" [ref=e72] [cursor=pointer]:
                - /url: /dashboard
            - listitem [ref=e73]:
              - text: /
              - link "Sample workspace" [ref=e74] [cursor=pointer]:
                - /url: /workspace/devsync-sample
            - listitem [ref=e75]: /Sprint board
        - generic [ref=e76]:
          - group "Workspace presence" [ref=e77]:
            - list "Collaborators" [ref=e78]:
              - listitem [ref=e79]:
                - img "Sample owner" [ref=e80]:
                  - generic [ref=e81]: SO
            - generic [ref=e82]: 1 online
          - button "Search and commands" [ref=e83] [cursor=pointer]:
            - generic [ref=e87]: Search
            - generic [ref=e88]: ⌘ / Ctrl K
          - button "Enter focus mode" [ref=e89] [cursor=pointer]
          - button "Keyboard shortcuts" [ref=e96] [cursor=pointer]
          - button "Sample owner" [ref=e101] [cursor=pointer]:
            - img "Sample owner" [ref=e102]:
              - generic [ref=e103]: SO
      - main [ref=e105]:
        - generic [ref=e107]:
          - generic [ref=e108]:
            - generic [ref=e109]:
              - heading "Main Board" [level=1] [ref=e110]
              - paragraph [ref=e111]: 1 tasks · Drag cards, or use Move for keyboard access.
            - button "Sprint Analytics" [ref=e112]
          - generic [ref=e117]:
            - generic [ref=e118]:
              - generic [ref=e119]:
                - generic [ref=e120]:
                  - heading "To Do" [level=2] [ref=e121]
                  - generic [ref=e122]: "1"
                - button "Add task to To Do" [ref=e123]
              - group "Review workspace permissions" [ref=e126]:
                - button "Review workspace permissions" [ref=e127]
                - combobox "Move Review workspace permissions" [ref=e129]:
                  - generic: To Do
                - generic [ref=e133]: Medium
            - generic [ref=e136]:
              - generic [ref=e137]:
                - heading "Browser target" [level=2] [ref=e138]
                - generic [ref=e139]: "0"
              - button "Add task to Browser target" [ref=e140]
      - button "AI Copilot" [ref=e143] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e147]
```

# Test source

```ts
  20  |   });
  21  | }
  22  | test('owner creates a workspace from the dashboard', async ({ page, context }) => {
  23  |   await login(context, 'owner');
  24  |   await page.goto('/dashboard');
  25  |   await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  26  |   const name = `Browser workspace ${Date.now()}`;
  27  |   await page.getByPlaceholder('My Project').fill(name);
  28  |   await page.getByRole('button', { name: 'Create', exact: true }).click();
  29  |   await expect(page.getByText(name, { exact: true })).toBeVisible();
  30  |   await page.reload();
  31  |   await expect(page.getByText(name, { exact: true })).toBeVisible();
  32  | });
  33  | test('two contexts edit the same document and both edits merge; viewer is read-only', async ({
  34  |   browser,
  35  | }) => {
  36  |   const contexts = await Promise.all([
  37  |     browser.newContext(),
  38  |     browser.newContext(),
  39  |     browser.newContext(),
  40  |   ]);
  41  |   try {
  42  |     await Promise.all(
  43  |       contexts.map((context, index) =>
  44  |         login(context, (['owner', 'editor', 'viewer'] as const)[index]),
  45  |       ),
  46  |     );
  47  |     const pages = await Promise.all(contexts.map((context) => context.newPage()));
  48  |     await Promise.all(pages.map((page) => page.goto(`/workspace/${workspace}/docs/${document}`)));
  49  |     for (const page of pages.slice(0, 2))
  50  |       await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  51  |     await expect(pages[2].locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
  52  |     await expect(pages[2].getByLabel('Document content')).toHaveAttribute('aria-readonly', 'true');
  53  |     const denied = await contexts[2].request.patch(`${api}/api/documents/${document}`, {
  54  |       data: { title: 'Viewer forbidden' },
  55  |     });
  56  |     expect(denied.status()).toBe(403);
  57  |     const edits = [`owner-${Date.now()}`, `editor-${Date.now()}`];
  58  |     await Promise.all(
  59  |       pages.slice(0, 2).map(async (page) => {
  60  |         await page.locator('.ProseMirror').click();
  61  |         await page.keyboard.press('Control+End');
  62  |       }),
  63  |     );
  64  |     await Promise.all(
  65  |       pages.slice(0, 2).map((page, index) => page.keyboard.insertText(edits[index])),
  66  |     );
  67  |     for (const page of pages)
  68  |       for (const edit of edits) await expect(page.locator('.ProseMirror')).toContainText(edit);
  69  |   } finally {
  70  |     await Promise.all(contexts.map((context) => context.close()));
  71  |   }
  72  | });
  73  | test('owner removes an editor with an open document and access closes within seconds', async ({
  74  |   browser,
  75  | }) => {
  76  |   const owner = await browser.newContext(),
  77  |     editor = await browser.newContext();
  78  |   try {
  79  |     await login(owner, 'owner');
  80  |     await login(editor, 'editor');
  81  |     const page = await editor.newPage();
  82  |     await page.goto(`/workspace/${workspace}/docs/${document}`);
  83  |     await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  84  |     const response = await owner.request.get(`${api}/api/workspaces/${workspace}`);
  85  |     const members = z
  86  |       .object({
  87  |         members: z.array(z.object({ id: z.string(), user: z.object({ email: z.string() }) })),
  88  |       })
  89  |       .parse(await response.json()).members;
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
> 120 |   const moved = page.waitForResponse(
      |                      ^ Error: page.waitForResponse: Test timeout of 240000ms exceeded.
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
  190 |       await expect(accept.getByRole('status')).toHaveText(
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
```