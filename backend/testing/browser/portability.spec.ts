import { test, expect } from '@playwright/test';
import { login } from './identities';

test('workspace portability controls enforce roles, explain limits, and initiate only successful downloads (fixture identities)', async ({
  browser,
}) => {
  const owner = await browser.newContext({ acceptDownloads: true });
  const viewer = await browser.newContext({ acceptDownloads: true });
  const api = 'http://127.0.0.1:5501/api/v1';
  const workspaceId = 'devsync-sample';
  try {
    await login(owner, 'owner');
    await login(viewer, 'viewer');

    const docs = await owner.newPage();
    await docs.goto(`/workspace/${workspaceId}/docs`);
    await docs.getByLabel('Choose Markdown document').setInputFiles({
      name: 'browser-portability.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Browser portability\n\nImported safely.'),
    });
    await docs.getByRole('dialog', { name: 'Confirm Markdown import' }).waitFor();
    await docs.getByRole('button', { name: 'Create document' }).click();
    await expect(docs.getByLabel('Document title')).toHaveValue('browser-portability');

    const markdownDownload = docs.waitForEvent('download');
    await docs.getByRole('button', { name: 'Download Markdown' }).click();
    expect((await markdownDownload).suggestedFilename()).toBe('document.md');
    await expect(
      docs.getByRole('status').filter({ hasText: 'has not confirmed file storage' }),
    ).toBeVisible();

    const pdfDownload = docs.waitForEvent('download');
    await docs.getByRole('button', { name: 'Download PDF' }).click();
    expect((await pdfDownload).suggestedFilename()).toBe('document.pdf');

    await docs.goto(`/workspace/${workspaceId}/docs`);
    await docs.getByLabel('Choose Markdown document').setInputFiles({
      name: 'unsupported-ui-fixture.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Safe\n\n- unsupported list'),
    });
    const markdownConfirm = docs.getByRole('dialog', { name: 'Confirm Markdown import' });
    await markdownConfirm.waitFor();
    await markdownConfirm.getByRole('button', { name: 'Create document' }).click();
    await expect(markdownConfirm.getByRole('alert')).toContainText('No document was created');
    await markdownConfirm.getByRole('button', { name: 'Cancel' }).click();

    await docs.getByRole('button', { name: 'Download workspace archive' }).click();
    const warning = docs.getByRole('dialog', { name: 'Workspace archive privacy warning' });
    await expect(warning.getByText(/unencrypted, unredacted and incomplete/)).toBeVisible();
    await expect(warning.getByText(/may itself contain sensitive information/)).toBeVisible();
    const archiveDownload = docs.waitForEvent('download');
    await warning.getByRole('button', { name: 'I understand, download archive' }).click();
    expect((await archiveDownload).suggestedFilename()).toBe('workspace-export.zip');

    const boards: { columns: { id: string }[] }[] = await (
      await owner.request.get(`${api}/workspaces/${workspaceId}/boards`)
    ).json();
    const columnId = boards[0]?.columns[0]?.id;
    if (!columnId) throw new Error('Fixture workspace is missing its task column');
    const board = await owner.newPage();
    await board.goto(`/workspace/${workspaceId}/kanban`);
    await expect(board.getByRole('button', { name: 'Import tasks CSV' })).toBeVisible();
    const headers = 'version,columnId,title,description,priority,assigneeId,dueDate';
    const row = ['1', columnId, 'Browser imported task', '', 'LOW', '', '']
      .map((value) => `"'${value.replace(/"/g, '""')}"`)
      .join(',');
    await board.getByLabel('Choose task CSV file').setInputFiles({
      name: 'tasks.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`${headers}\r\n${row}\r\n`),
    });
    const taskConfirm = board.getByRole('dialog', { name: 'Confirm task import' });
    await taskConfirm.waitFor();
    await taskConfirm.getByRole('button', { name: 'Import CSV' }).click();
    await expect(
      board.getByRole('status').filter({ hasText: 'Import completed: 1 task created.' }),
    ).toBeVisible();

    const viewerBoard = await viewer.newPage();
    await viewerBoard.goto(`/workspace/${workspaceId}/kanban`);
    await expect(viewerBoard.getByRole('button', { name: 'Import tasks CSV' })).toHaveCount(0);
    const viewerCsvDownload = viewerBoard.waitForEvent('download');
    await viewerBoard.getByRole('button', { name: 'Export tasks CSV' }).click();
    expect((await viewerCsvDownload).suggestedFilename()).toBe('tasks.csv');

    const viewerDocs = await viewer.newPage();
    await viewerDocs.goto(`/workspace/${workspaceId}/docs`);
    await expect(viewerDocs.getByRole('button', { name: 'Import Markdown' })).toHaveCount(0);
    await expect(
      viewerDocs.getByRole('button', { name: 'Download workspace archive' }),
    ).toBeVisible();
  } finally {
    await owner.close();
    await viewer.close();
  }
});
