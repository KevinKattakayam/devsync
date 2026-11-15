import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { documentApi, taskApi, workspaceApi } from '@/lib/api';
import {
  DocumentExportControls,
  MarkdownImportControl,
  TaskCsvControls,
  WorkspaceArchiveControl,
} from '@/components/workspace/portability-controls';

vi.mock('@/lib/api', () => ({
  documentApi: {
    importMarkdown: vi.fn(),
    exportMarkdown: vi.fn(),
    exportPdf: vi.fn(),
  },
  taskApi: { importCsv: vi.fn(), exportCsv: vi.fn() },
  workspaceApi: { exportArchive: vi.fn() },
}));

const mocked = {
  markdownImport: vi.mocked(documentApi.importMarkdown),
  markdownExport: vi.mocked(documentApi.exportMarkdown),
  pdfExport: vi.mocked(documentApi.exportPdf),
  csvImport: vi.mocked(taskApi.importCsv),
  csvExport: vi.mocked(taskApi.exportCsv),
  archive: vi.mocked(workspaceApi.exportArchive),
};

function file(name: string, text: string, type = 'text/plain') {
  const value = new File([text], name, { type });
  Object.defineProperty(value, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(text).buffer,
    configurable: true,
  });
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'request-key' });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:download'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('validates Markdown extension and size before requesting import, then confirms and opens only after success', async () => {
  const user = userEvent.setup();
  const openDocument = vi.fn();
  render(<MarkdownImportControl workspaceId="workspace-1" canEdit onImported={openDocument} />);

  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [file('notes.txt', '# Notes')] },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('Choose a Markdown');
  expect(mocked.markdownImport).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [file('notes.md', '# Notes\n\nBody')] },
  });
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByText(/other rich formatting are rejected/)).toBeTruthy();
  mocked.markdownImport.mockResolvedValueOnce({ data: { id: 'doc-1' } } as never);
  await user.click(screen.getByRole('button', { name: 'Create document' }));
  await waitFor(() => expect(openDocument).toHaveBeenCalledWith('doc-1'));
  expect(mocked.markdownImport).toHaveBeenCalledWith(
    'workspace-1',
    { title: 'notes', markdown: '# Notes\n\nBody' },
    'request-key',
  );
  expect(screen.getByRole('status').textContent).toContain('import completed');
});

it('rejects oversized and malformed UTF-8 import files before any API call', async () => {
  render(<MarkdownImportControl workspaceId="workspace-1" canEdit onImported={vi.fn()} />);
  const oversized = file('large.md', 'x'.repeat(256 * 1024 + 1));
  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [oversized] },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('no larger than 256 KiB');

  const invalidUtf8 = file('invalid.md', '');
  Object.defineProperty(invalidUtf8, 'arrayBuffer', {
    value: async () => new Uint8Array([0xc3, 0x28]).buffer,
  });
  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [invalidUtf8] },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('not valid UTF-8');
  expect(mocked.markdownImport).not.toHaveBeenCalled();
});

it('rejects task CSV files over the upload bound before opening confirmation', async () => {
  render(<TaskCsvControls workspaceId="workspace-1" canEdit />);
  const oversized = file('large.csv', 'x'.repeat(1024 * 1024 + 1), 'text/csv');
  fireEvent.change(screen.getByLabelText('Choose task CSV file'), {
    target: { files: [oversized] },
  });
  expect((await screen.findByRole('alert')).textContent).toContain('no larger than 1024 KiB');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mocked.csvImport).not.toHaveBeenCalled();
});

it('does not show Markdown import for viewers and reports expired session without success', async () => {
  const { rerender } = render(
    <MarkdownImportControl workspaceId="workspace-1" canEdit={false} onImported={vi.fn()} />,
  );
  expect(screen.queryByRole('button', { name: 'Import Markdown' })).toBeNull();
  rerender(<MarkdownImportControl workspaceId="workspace-1" canEdit onImported={vi.fn()} />);
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [file('bad.md', '<script>bad</script>')] },
  });
  await screen.findByRole('dialog');
  mocked.markdownImport.mockRejectedValueOnce({ response: { status: 401 } });
  await user.click(screen.getByRole('button', { name: 'Create document' }));
  expect((await screen.findByRole('alert')).textContent).toContain('session expired');
  expect(screen.queryByText(/import completed/)).toBeNull();
});

it('reports rejected Markdown as an atomic failure with no success state', async () => {
  const user = userEvent.setup();
  render(<MarkdownImportControl workspaceId="workspace-1" canEdit onImported={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Choose Markdown document'), {
    target: { files: [file('unsupported.md', '# Title\n\n- list')] },
  });
  await screen.findByRole('dialog');
  mocked.markdownImport.mockRejectedValueOnce({ response: { status: 400 } });
  await user.click(screen.getByRole('button', { name: 'Create document' }));
  expect((await screen.findByRole('alert')).textContent).toContain('No document was created');
  expect(screen.queryByText(/import completed/)).toBeNull();
});

it('downloads authorized Markdown and PDF with explicit initiation status and blocks archived exports', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<DocumentExportControls documentId="doc-1" archived={false} />);
  mocked.markdownExport.mockResolvedValueOnce({ data: new Blob(['# current']) } as never);
  await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
  expect((await screen.findByRole('status')).textContent).toContain(
    'has not confirmed file storage',
  );
  expect(mocked.markdownExport).toHaveBeenCalledWith('doc-1');

  mocked.pdfExport.mockResolvedValueOnce({ data: new Blob(['pdf']) } as never);
  await user.click(screen.getByRole('button', { name: 'Download PDF' }));
  expect(mocked.pdfExport).toHaveBeenCalledWith('doc-1');
  await waitFor(() => expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(2), {
    timeout: 2_000,
  });
  rerender(<DocumentExportControls documentId="doc-1" archived />);
  expect(screen.getByRole('button', { name: 'Download Markdown' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(
    screen
      .getAllByRole('status')
      .some((element) => element.textContent?.includes('Archived documents cannot be exported')),
  ).toBe(true);
});

it('confirms CSV import, reuses its idempotency key and reports authorization failures', async () => {
  const user = userEvent.setup();
  render(<TaskCsvControls workspaceId="workspace-1" canEdit />);
  fireEvent.change(screen.getByLabelText('Choose task CSV file'), {
    target: {
      files: [
        file(
          'tasks.csv',
          'columnId,title,description,priority,assigneeId,dueDate\nc1,Ship,,,,\n',
          'text/csv',
        ),
      ],
    },
  });
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByText(/creates the batch atomically/)).toBeTruthy();
  mocked.csvImport.mockRejectedValueOnce({ response: { status: 403 } });
  await user.click(screen.getByRole('button', { name: 'Import CSV' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Workspace access is unavailable',
  );
  expect(mocked.csvImport).toHaveBeenCalledWith(
    'workspace-1',
    'columnId,title,description,priority,assigneeId,dueDate\nc1,Ship,,,,\n',
    'request-key',
  );
  mocked.csvImport.mockResolvedValueOnce({ data: { imported: 1 } } as never);
  await user.click(screen.getByRole('button', { name: 'Import CSV' }));
  await waitFor(() => expect(mocked.csvImport).toHaveBeenCalledTimes(2));
  expect(mocked.csvImport.mock.calls[1]?.[2]).toBe('request-key');
  expect((await screen.findByRole('status')).textContent).toContain('Import completed: 1 task');
});

it('allows viewers to export task CSV, denies import controls and handles export authorization errors', async () => {
  const user = userEvent.setup();
  render(<TaskCsvControls workspaceId="workspace-1" canEdit={false} />);
  expect(screen.queryByRole('button', { name: 'Import tasks CSV' })).toBeNull();
  mocked.csvExport.mockRejectedValueOnce({ response: { status: 401 } });
  await user.click(screen.getByRole('button', { name: 'Export tasks CSV' }));
  expect((await screen.findByRole('alert')).textContent).toContain('session expired');
});

it('requires privacy confirmation for workspace archive and discloses its limits', async () => {
  const user = userEvent.setup();
  render(<WorkspaceArchiveControl workspaceId="workspace-1" />);
  await user.click(screen.getByRole('button', { name: 'Download workspace archive' }));
  expect(screen.getByText(/unencrypted, unredacted and incomplete/)).toBeTruthy();
  expect(screen.getByText(/may itself contain sensitive information/)).toBeTruthy();
  expect(mocked.archive).not.toHaveBeenCalled();
  mocked.archive.mockResolvedValueOnce({ data: new Blob(['zip']) } as never);
  await user.click(screen.getByRole('button', { name: 'I understand, download archive' }));
  expect((await screen.findByRole('status')).textContent).toContain(
    'has not confirmed file storage',
  );
  expect(mocked.archive).toHaveBeenCalledWith('workspace-1');
  await waitFor(() => expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1), {
    timeout: 2_000,
  });
});

it('keeps failed export status accessible and does not claim a download', async () => {
  const user = userEvent.setup();
  render(<WorkspaceArchiveControl workspaceId="workspace-1" />);
  await user.click(screen.getByRole('button', { name: 'Download workspace archive' }));
  mocked.archive.mockRejectedValueOnce({ response: { status: 413 } });
  await user.click(screen.getByRole('button', { name: 'I understand, download archive' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'exceeds the server import limit',
  );
  expect(screen.queryByText(/download initiated/)).toBeNull();
});

it('reports bounded archive rejection without claiming a partial download', async () => {
  const user = userEvent.setup();
  render(<WorkspaceArchiveControl workspaceId="workspace-1" />);
  await user.click(screen.getByRole('button', { name: 'Download workspace archive' }));
  mocked.archive.mockRejectedValueOnce({ response: { status: 400 } });
  await user.click(screen.getByRole('button', { name: 'I understand, download archive' }));
  expect((await screen.findByRole('alert')).textContent).toContain('no partial file was delivered');
  expect(screen.queryByText(/download initiated/)).toBeNull();
});
