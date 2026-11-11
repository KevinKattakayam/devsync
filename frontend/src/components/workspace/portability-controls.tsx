'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { documentApi, taskApi, workspaceApi } from '@/lib/api';
import { Button } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui/overlays';
import { errorMessage } from '@/lib/errors';

const MAX_MARKDOWN_BYTES = 256 * 1024;
const MAX_CSV_BYTES = 1024 * 1024;

function requestError(error: unknown, fallback: string, invalidRequest?: string): string {
  const status =
    error && typeof error === 'object' && 'response' in error
      ? (error.response as { status?: number } | undefined)?.status
      : undefined;
  if (status === 401) return 'Your session expired. Sign in again, then retry.';
  if (status === 403 || status === 404)
    return 'Workspace access is unavailable. Check membership and workspace status.';
  if (status === 413) return 'The selected file exceeds the server import limit.';
  if (status === 429) return 'Too many requests. Wait briefly before trying again.';
  if (status === 400) return invalidRequest || `${fallback} Check the request and try again.`;
  return errorMessage(error, fallback);
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 100) || 'document';
}

function startDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readUtf8(file: File, limit: number): Promise<string> {
  if (file.size > limit)
    throw new Error(`Choose a file no larger than ${Math.floor(limit / 1024)} KiB.`);
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
}

export function MarkdownImportControl({
  workspaceId,
  canEdit,
  onImported,
}: {
  workspaceId: string;
  canEdit: boolean;
  onImported: (documentId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ title: string; markdown: string; key: string } | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState('');

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError('');
    setStatus('');
    if (!/\.md(?:own)?$/i.test(file.name)) {
      setError('Choose a Markdown .md or .mdown file.');
      return;
    }
    try {
      const markdown = await readUtf8(file, MAX_MARKDOWN_BYTES);
      const title = safeFilename(file.name.replace(/\.md(?:own)?$/i, ''));
      setPending({ title, markdown, key: crypto.randomUUID() });
      setConfirmOpen(true);
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? 'The file is not valid UTF-8.'
          : requestError(caught, 'Markdown import failed.'),
      );
    }
  }

  async function confirmImport() {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    setProgress('Creating document…');
    try {
      const { data } = await documentApi.importMarkdown(
        workspaceId,
        { title: pending.title, markdown: pending.markdown },
        pending.key,
      );
      setStatus('Markdown import completed. Opening the new document.');
      setConfirmOpen(false);
      setPending(null);
      onImported(data.id);
    } catch (caught) {
      setStatus('');
      setError(
        requestError(
          caught,
          'Markdown import failed.',
          'The Markdown is invalid, unsupported or over its limit. No document was created.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  if (!canEdit) return null;
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept=".md,.mdown,text/markdown"
        className="sr-only"
        aria-label="Choose Markdown document"
        onChange={importFile}
      />
      <Button
        variant="secondary"
        pending={busy}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        Import Markdown
      </Button>
      <p className="text-xs text-muted-foreground">
        Supports paragraphs and ATX headings only; other formatting is rejected. Maximum 256 KiB.
      </p>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm">
          {progress}
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent
          title="Confirm Markdown import"
          description="A new document will be created. Existing documents are not replaced."
        >
          <p className="text-sm">
            Only paragraphs and ATX headings are accepted. Lists, links, code, HTML and other rich
            formatting are rejected without creating a document.
          </p>
          {pending && (
            <p className="mt-2 break-words text-sm">
              File: {pending.title}.md · {new TextEncoder().encode(pending.markdown).byteLength}{' '}
              bytes
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button pending={busy} disabled={busy || !pending} onClick={() => void confirmImport()}>
              Create document
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                setPending(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DocumentExportControls({
  documentId,
  archived,
}: {
  documentId: string;
  archived: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function download(format: 'markdown' | 'pdf') {
    setBusy(true);
    setError('');
    setStatus('');
    setProgress(`Preparing ${format.toUpperCase()} download…`);
    try {
      const response =
        format === 'markdown'
          ? await documentApi.exportMarkdown(documentId)
          : await documentApi.exportPdf(documentId);
      startDownload(response.data, format === 'markdown' ? 'document.md' : 'document.pdf');
      setStatus(
        `Browser download initiated for ${format.toUpperCase()}. The browser has not confirmed file storage.`,
      );
    } catch (caught) {
      setError(
        requestError(
          caught,
          'Document export failed.',
          format === 'markdown'
            ? 'The document contains unsupported Markdown formatting or exceeds export limits; no file was downloaded.'
            : 'The document cannot be rendered in the supported PDF format or exceeded its limits; no file was downloaded.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="space-y-2" role="group" aria-label="Document exports">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          pending={busy}
          disabled={busy || archived}
          onClick={() => void download('markdown')}
        >
          Download Markdown
        </Button>
        <Button
          variant="secondary"
          pending={busy}
          disabled={busy || archived}
          onClick={() => void download('pdf')}
        >
          Download PDF
        </Button>
      </div>
      {archived && (
        <p role="status" className="text-xs text-muted-foreground">
          Archived documents cannot be exported.
        </p>
      )}
      {busy && (
        <p role="status" aria-live="polite" className="text-sm">
          {progress}
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function TaskCsvControls({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [importKey, setImportKey] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function selectCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError('');
    setStatus('');
    if (!/\.csv$/i.test(file.name)) {
      setError('Choose a .csv file.');
      return;
    }
    try {
      const text = await readUtf8(file, MAX_CSV_BYTES);
      setCsv(text);
      setImportKey(crypto.randomUUID());
      setConfirmOpen(true);
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? 'The file is not valid UTF-8.'
          : caught instanceof Error
            ? caught.message
            : 'CSV could not be read.',
      );
    }
  }

  async function importCsv() {
    if (csv === null || !canEdit || busy) return;
    setBusy(true);
    setError('');
    setProgress('Validating and importing tasks…');
    try {
      const { data } = await taskApi.importCsv(workspaceId, csv, importKey);
      setStatus(
        `Import completed: ${data.imported} task${data.imported === 1 ? '' : 's'} created.`,
      );
      setCsv(null);
      setConfirmOpen(false);
    } catch (caught) {
      setStatus('');
      setError(
        requestError(
          caught,
          'Task CSV import failed. Retry with the same selected file to safely reuse its idempotency key.',
          'The CSV is invalid or has unsupported fields or relationships. No tasks were created.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function exportCsv() {
    setBusy(true);
    setError('');
    setStatus('');
    setProgress('Preparing task CSV download…');
    try {
      const { data } = await taskApi.exportCsv(workspaceId);
      startDownload(data, 'tasks.csv');
      setStatus(
        'Browser download initiated for tasks.csv. The browser has not confirmed file storage.',
      );
    } catch (caught) {
      setError(
        requestError(
          caught,
          'Task CSV export failed.',
          'The task CSV exceeds supported output limits; no file was downloaded.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <section className="space-y-2" aria-label="Task CSV portability">
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Choose task CSV file"
        onChange={(event) => void selectCsv(event)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" pending={busy} disabled={busy} onClick={() => void exportCsv()}>
          Export tasks CSV
        </Button>
        {canEdit && (
          <Button
            variant="secondary"
            pending={busy}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Import tasks CSV
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        CSV v1 supports up to 1,000 tasks and 1 MiB. The server validates the full import
        atomically.
      </p>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm">
          {progress}
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent
          title="Confirm task import"
          description="The server validates every row and creates the batch atomically. Invalid input creates no tasks."
        >
          <p className="text-sm">
            Import this selected CSV into the current workspace? Only owners and editors can import.
            A retry of this selection reuses the same request key.
          </p>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button pending={busy} disabled={busy} onClick={() => void importCsv()}>
              Import CSV
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                setCsv(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function WorkspaceArchiveControl({ workspaceId }: { workspaceId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    setStatus('');
    setProgress('Preparing workspace archive…');
    try {
      const { data } = await workspaceApi.exportArchive(workspaceId);
      startDownload(data, 'workspace-export.zip');
      setStatus('Browser download initiated. The browser has not confirmed file storage.');
      setConfirmOpen(false);
    } catch (caught) {
      setError(
        requestError(
          caught,
          'Workspace archive export failed.',
          'The archive has unsupported content or exceeded output limits; no partial file was delivered.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        pending={busy}
        disabled={busy}
        onClick={() => setConfirmOpen(true)}
      >
        Download workspace archive
      </Button>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent
          title="Workspace archive privacy warning"
          description="Review the contents and privacy limits before starting this download."
        >
          <p className="text-sm">
            This workspace-scoped archive is <strong>unencrypted, unredacted and incomplete</strong>
            . It contains supported document Markdown and task CSV only. It excludes account data,
            document titles and metadata, snippets, decisions, GitHub data and other workspace
            records. Included document and task content may itself contain sensitive information. Do
            not store it in a shared location unless permitted.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button pending={busy} disabled={busy} onClick={() => void download()}>
              I understand, download archive
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm">
          {progress}
        </p>
      )}
      {status && (
        <p role="status" aria-live="polite" className="text-sm">
          {status}
        </p>
      )}
      {error && !confirmOpen && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
