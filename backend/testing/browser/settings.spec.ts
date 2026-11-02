import { test, expect, type Page } from '@playwright/test';
import axe from '../../../frontend/node_modules/axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { login } from './identities';
const api = 'http://127.0.0.1:5501/api';
const workspace = 'devsync-sample';
const pass = process.env.E2E_SETTINGS_PASS === 'final' ? 'final' : 'initial';
const output = resolve(__dirname, '../../../docs/ui/after/settings', pass);
async function capture(page: Page, theme: string, width: number, state: string) {
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axe.source });
  const report = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    const main = document.querySelector('.shell-main');
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      bounds: {
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
        main: main?.clientWidth,
        scroll: main?.scrollWidth,
      },
    };
  });
  await writeFile(
    resolve(output, `${theme}-${width}-${state}.json`),
    JSON.stringify(report, null, 2),
  );
  await page.screenshot({
    path: resolve(output, `${theme}-${width}-${state}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  console.log(
    `${theme} ${width} ${state}: ${report.violations.length} axe violations; ${report.incomplete.length} incomplete`,
  );
  expect(
    report.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(report.bounds.page).toBeLessThanOrEqual(width);
  expect(report.bounds.scroll || 0).toBeLessThanOrEqual((report.bounds.main || width) + 1);
}
for (const theme of ['dark', 'light'] as const)
  for (const width of [1440, 390]) {
    test(`${theme} ${width} settings states, keyboard and invitation revocation`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        await login(context, 'owner');
        await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
        await context.route(`**/api/workspaces/${workspace}`, async (route) => {
          await barrier;
          await route.continue();
        });
        const page = await context.newPage();
        await page.goto(`/workspace/${workspace}/settings`);
        await expect(
          page.getByRole('status', { name: 'Loading workspace settings' }),
        ).toBeVisible();
        await capture(page, theme, width, 'loading');
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await expect(page.getByRole('heading', { name: 'Members & roles' })).toBeVisible();
        await capture(page, theme, width, 'ready');
        await page
          .getByRole('heading', { name: 'Links created in this view' })
          .scrollIntoViewIfNeeded();
        await capture(page, theme, width, 'invitations-empty');
        const role = page.getByRole('combobox', { name: 'Role for Sample editor' });
        await role.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('option', { name: 'Editor', exact: true })).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(page.getByRole('option', { name: 'Viewer', exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: 'Change member role?' })).toBeVisible();
        const dialog = page.getByRole('dialog', { name: 'Change member role?' });
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
        await page.keyboard.press('Shift+Tab');
        await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
        await capture(page, theme, width, 'role-dialog');
        await page.keyboard.press('Escape');
        await expect(role).toBeFocused();
        await page.getByRole('button', { name: 'Remove Sample editor', exact: true }).click();
        await capture(page, theme, width, 'remove-dialog');
        await page.keyboard.press('Escape');
        await page.getByRole('textbox', { name: 'Search settings' }).fill('no-matching-settings');
        await expect(page.getByText('No settings match', { exact: true })).toBeVisible();
        await capture(page, theme, width, 'search-empty');
        await page.getByRole('button', { name: 'Clear search' }).click();
        await page
          .getByRole('textbox', { name: 'Recipient email' })
          .fill('sample-viewer@devsync.invalid');
        await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
        await expect(page.getByRole('link', { name: 'Open invitation link' })).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Create invitation', exact: true }),
        ).toBeEnabled();
        await capture(page, theme, width, 'invite-created');
        await page.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
        await capture(page, theme, width, 'revoke-dialog');
        await page.getByRole('button', { name: 'Confirm revocation' }).click();
        await expect(page.getByText('revoked', { exact: true })).toBeVisible();
        await context.route(`**/api/workspaces/${workspace}`, (route) =>
          route.fulfill({ status: 503, json: { error: 'Injected test outage' } }),
        );
        await page.getByRole('button', { name: 'Refresh workspace access' }).click();
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
        await capture(page, theme, width, 'error-injected');
        await context.unrouteAll({ behavior: 'wait' });
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Members & roles' })).toBeVisible();
      } finally {
        release();
        await context.unrouteAll({ behavior: 'wait' });
        await context.close();
      }
    });
  }
test('owner invitation acceptance, role change Undo and member removal', async ({ browser }) => {
  const owner = await browser.newContext(),
    recipient = await browser.newContext();
  try {
    await login(owner, 'owner');
    await login(recipient, 'editor');
    const created = await owner.request.post(`${api}/workspaces`, {
      data: { name: 'Settings acceptance workspace' },
    });
    expect(created.status()).toBe(201);
    const { id }: { id: string } = await created.json();
    const page = await owner.newPage();
    await page.goto(`/workspace/${id}/settings`);
    await page
      .getByRole('textbox', { name: 'Recipient email' })
      .fill('sample-editor@devsync.invalid');
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Open invitation link' })).toBeVisible();
    const link = await page
      .getByRole('link', { name: 'Open invitation link' })
      .getAttribute('href');
    if (!link) throw new Error('Missing created invitation');
    const accept = await recipient.newPage();
    await accept.goto(link);
    await accept.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(accept.getByRole('status').filter({ hasText: 'Invitation accepted.' })).toHaveText(
      'Invitation accepted. Your role is VIEWER.',
    );
    await page.getByRole('button', { name: 'Refresh workspace access' }).click();
    const role = page.getByRole('combobox', { name: 'Role for Sample editor' });
    await expect(role).toHaveText('Viewer');
    await role.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: 'Viewer', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Editor', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Confirm role change' }).click();
    await expect(role).toHaveText('Editor');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(role).toHaveText('Viewer');
    await expect(page.getByText('Role change undone', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Sample editor', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm removal' }).click();
    await expect(
      page.getByRole('button', { name: 'Remove Sample editor', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Member removed. A new invitation is required to rejoin.', { exact: true }),
    ).toBeVisible();
    expect((await recipient.request.get(`${api}/workspaces/${id}`)).status()).toBe(403);
  } finally {
    await owner.close();
    await recipient.close();
  }
});
test('editor and viewer admin denials and 360px read-only settings', async ({ browser }) => {
  const owner = await browser.newContext();
  try {
    await login(owner, 'owner');
    const data: { members: { id: string; role: string }[] } = await (
      await owner.request.get(`${api}/workspaces/${workspace}`)
    ).json();
    const target = data.members.find((m) => m.role === 'VIEWER');
    if (!target) throw new Error('Missing seed viewer');
    const invitation = await owner.request.post(`${api}/workspaces/${workspace}/invitations`, {
      data: { email: 'sample-viewer@devsync.invalid', role: 'VIEWER' },
    });
    expect(invitation.status()).toBe(201);
    const { id }: { id: string } = await invitation.json();
    for (const role of ['editor', 'viewer'] as const) {
      const context = await browser.newContext({
        viewport: { width: 360, height: 1000 },
        reducedMotion: 'reduce',
      });
      try {
        await login(context, role);
        const page = await context.newPage();
        await page.goto(`/workspace/${workspace}/settings`);
        await expect(page.getByText(`You have ${role} access.`, { exact: false })).toBeVisible();
        await expect(page.locator('[data-settings]').getByRole('combobox')).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Create invitation', exact: true }),
        ).toHaveCount(0);
        for (const theme of ['dark', 'light']) {
          await page.evaluate((theme) => {
            localStorage.setItem('theme', theme);
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(theme);
          }, theme);
          await capture(page, theme, 360, `${role}-read-only`);
        }
        expect(
          (
            await context.request.patch(`${api}/workspaces/${workspace}/members/${target.id}`, {
              data: { role: 'OWNER' },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.delete(`${api}/workspaces/${workspace}/members/${target.id}`)
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.post(`${api}/workspaces/${workspace}/invitations`, {
              data: { email: 'sample-editor@devsync.invalid', role: 'EDITOR' },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await context.request.delete(`${api}/workspaces/${workspace}/invitations/${id}`)
          ).status(),
        ).toBe(403);
      } finally {
        await context.close();
      }
    }
    expect(
      (await owner.request.delete(`${api}/workspaces/${workspace}/invitations/${id}`)).status(),
    ).toBe(204);
  } finally {
    await owner.close();
  }
});
