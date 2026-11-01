import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { resolve } from 'path';
import { login } from './identities';
import { z } from 'zod';

test('capture public and authenticated page evidence at both requested widths', async ({
  browser,
}) => {
  test.setTimeout(900000);
  const target = process.env.E2E_UI_CAPTURE;
  if (target !== 'before' && target !== 'current') throw new Error('UI capture target required');
  const directory = resolve(__dirname, `../../../docs/ui/${target}`);
  await mkdir(directory, { recursive: true });
  const routes = [
    ['home', '/', 'DevSync'],
    ['login', '/login', ''],
    ['signup', '/signup', ''],
    ['sign-in', '/sign-in', ''],
    ['sign-up', '/sign-up', ''],
    ['dashboard', '/dashboard', 'Good'],
    ['settings-billing', '/settings/billing', ''],
    ['workspace-audit-placeholder', '/workspace/devsync-sample', 'Sample workspace'],
    ['workspace-audit-placeholder-docs', '/workspace/devsync-sample/docs', 'Welcome'],
    [
      'workspace-audit-placeholder-docs-audit-document',
      '/workspace/devsync-sample/docs/devsync-sample-doc',
      '',
    ],
    ['workspace-audit-placeholder-kanban', '/workspace/devsync-sample/kanban', 'Main Board'],
    ['workspace-audit-placeholder-snippets', '/workspace/devsync-sample/snippets', ''],
    [
      'workspace-audit-placeholder-settings',
      '/workspace/devsync-sample/settings',
      'Workspace Settings',
    ],
    ['superadmin', '/superadmin', ''],
  ];
  const records: {
    path: string;
    width: number;
    status?: number;
    finalPath?: string;
    file?: string;
    error?: string;
  }[] = [];
  const previous =
    process.env.E2E_UI_RETRY === 'missing'
      ? z
          .object({
            records: z.array(
              z.object({
                path: z.string(),
                width: z.number(),
                status: z.number().optional(),
                finalPath: z.string().optional(),
                file: z.string().optional(),
                error: z.string().optional(),
              }),
            ),
          })
          .parse(JSON.parse(await readFile(resolve(directory, 'phase1e-manifest.json'), 'utf8')))
          .records
      : [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      await login(context, 'owner');
      const page = await context.newPage();
      const viewportRoutes = [...routes];
      if (target === 'current') {
        const response = await context.request.post(
          'http://127.0.0.1:5501/api/workspaces/devsync-sample/invitations',
          {
            data: { email: 'sample-owner@devsync.invalid', role: 'VIEWER' },
          },
        );
        expect(response.status()).toBe(201);
        const invitation = z.object({ id: z.string() }).parse(await response.json());
        viewportRoutes.push([
          'invitation',
          `/invitations/${invitation.id}`,
          'Workspace invitation',
        ]);
      }
      for (const [name, path, text] of viewportRoutes) {
        const prior = previous.find((record) => record.path === path && record.width === width);
        if (prior?.file || (prior?.path === '/superadmin' && prior.status === 500)) {
          records.push(prior);
          continue;
        }
        const record: (typeof records)[number] = { path, width };
        try {
          const response = await page.goto(`http://127.0.0.1:3001${path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000,
          });
          record.status = response?.status();
          record.finalPath = new URL(page.url()).pathname;
          if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
          if (record.finalPath !== path) throw new Error(`Redirected to ${record.finalPath}`);
          if (path === '/workspace/devsync-sample/docs') {
            await expect(
              page.locator('main').getByRole('heading', { name: 'Documentation Hub', exact: true }),
            ).toBeVisible();
            const title = page.locator('main h3').filter({ hasText: /^Welcome$/ });
            await expect(title).toHaveText('Welcome');
            console.log(
              JSON.stringify({
                source: target,
                width,
                documentTitleBounds: await title.boundingBox(),
              }),
            );
          } else if (text) {
            const content = path === '/' ? page : page.locator('main');
            await expect(content.getByText(text, { exact: false }).first()).toBeVisible();
          }
          if (['/login', '/signup', '/sign-in', '/sign-up'].includes(path))
            await expect(page.locator('.cl-rootBox:visible')).toHaveCount(1, { timeout: 45000 });
          else if (path.includes('/docs/') && path.endsWith('devsync-sample-doc'))
            await expect(page.locator('.ProseMirror')).toBeVisible();
          else if (path !== '/') await expect(page.locator('main')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: resolve(directory, `${name}-${width}.png`),
            fullPage: true,
          });
          record.file = `${name}-${width}.png`;
        } catch (error) {
          // Never capture framework error pages, which can expose server implementation details.
          record.error =
            error instanceof Error
              ? error.message.split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '')
              : 'Capture failed';
          if (path === '/workspace/devsync-sample/docs') {
            const response = await context.request.get(
              'http://127.0.0.1:5501/api/workspaces/devsync-sample/documents',
            );
            if (response.ok()) {
              const documents = z
                .array(z.object({ title: z.string() }))
                .parse(await response.json());
              record.error += `; API document titles: ${JSON.stringify(documents.map((item) => item.title))}`;
            } else record.error += `; document API HTTP ${response.status()}`;
          }
        }
        records.push(record);
        await writeFile(
          resolve(directory, 'phase1e-partial.json'),
          JSON.stringify(records, null, 2),
        );
      }
    } finally {
      await context.close();
    }
  }
  await writeFile(
    resolve(directory, 'phase1e-manifest.json'),
    JSON.stringify(
      {
        source:
          target === 'before'
            ? 'main@9deffe28f37cf86905617cb6e4105b6588ed5f56'
            : 'upgrade/enterprise',
        authentication:
          'isolated fixture identity adapter; actual public Clerk widgets; disposable migrated current backend',
        records,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      target,
      captured: records.filter((record) => record.file).length,
      unavailable: records
        .filter((record) => record.error)
        .map(({ path, width, error }) => ({ path, width, error })),
    }),
  );
  expect(records.filter((record) => record.file).length).toBeGreaterThan(0);
});
