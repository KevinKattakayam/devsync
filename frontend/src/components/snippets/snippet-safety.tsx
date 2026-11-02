'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { snippetApi } from '@/lib/api';
import { loadWorkspaceAccess } from '@/lib/workspace-access';
import { preflightSnippet, type SnippetFields, type SafetyFinding } from '@/lib/snippet-preflight';
import { snippetSafetyApi, type SafetySnippet } from '@/lib/snippet-safety-api';
function SafetyButton({ className = '', ...props }: ComponentProps<typeof Button>) {
  return <Button {...props} className={`enabled:hover:opacity-100 ${className}`} />;
}
const blank: SnippetFields = { title: '', code: '', language: 'typescript', description: '' };
type Access = Awaited<ReturnType<typeof loadWorkspaceAccess>>;
export function SnippetSafety({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return <Safety key={`${user?.id}:${workspaceId}`} workspaceId={workspaceId} />;
}
export function Safety({ workspaceId }: { workspaceId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    attempt: number;
    access?: Access;
    snippets?: SafetySnippet[];
    error?: boolean;
  }>();
  useEffect(() => {
    let active = true;
    void Promise.all([loadWorkspaceAccess(workspaceId), snippetApi.list(workspaceId)])
      .then(([access, r]) => {
        if (active) setSnapshot({ attempt, access, snippets: r.data });
      })
      .catch(() => {
        if (active) setSnapshot({ attempt, error: true });
      });
    return () => {
      active = false;
    };
  }, [workspaceId, attempt]);
  const refresh = () => setAttempt((v) => v + 1);
  if (!snapshot || snapshot.attempt !== attempt || !snapshot.access || !snapshot.snippets)
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
        <h1 className="text-[28px] font-semibold">Snippet safety preflight</h1>
        {snapshot?.attempt === attempt && snapshot.error ? (
          <div role="alert" className="space-y-4">
            <p>Snippet safety is unavailable. Access or feature configuration may have changed.</p>
            <SafetyButton onClick={refresh}>Try again</SafetyButton>
          </div>
        ) : (
          <div role="status" aria-label="Loading snippet safety" className="space-y-4">
            <span className="sr-only">Loading snippet safety</span>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
      </div>
    );
  return (
    <div
      className="mx-auto min-w-0 max-w-5xl space-y-8 px-4 pt-8 pb-24 md:px-8"
      data-snippet-safety
    >
      <header className="space-y-3">
        <h1 className="text-[28px] font-semibold leading-9">Snippet safety preflight</h1>
        <SafetyButton variant="secondary" onClick={refresh}>
          Reload snippets
        </SafetyButton>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Review suspicious credentials before saving code. Detected values are removed, never
          offered as a save-anyway option.
        </p>
        <Link
          href={`/workspace/${workspaceId}/snippets`}
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          Back to snippets
        </Link>
      </header>
      <p className="text-sm leading-6 text-muted-foreground">
        Pattern checks can miss secrets or flag harmless examples. A clean result is not a
        guarantee. Rotate exposed credentials at their provider; masking does not revoke them.
      </p>
      {snapshot.access.role === 'VIEWER' ? (
        <ReadOnlyFindings workspaceId={workspaceId} snippets={snapshot.snippets} />
      ) : (
        <Composer
          key={attempt}
          workspaceId={workspaceId}
          snippets={snapshot.snippets}
          saved={refresh}
        />
      )}
    </div>
  );
}
function Findings({ findings }: { findings: SafetyFinding[] }) {
  return findings.length ? (
    <ul className="space-y-2 text-sm">
      {findings.map((f) => (
        <li key={f.type} className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">{f.type}</Badge>
          <code className="break-all font-mono">{f.maskedPreview}</code>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      No patterns detected. Review the code yourself before sharing it.
    </p>
  );
}
function ReadOnlyFindings({
  workspaceId,
  snippets,
}: {
  workspaceId: string;
  snippets: SafetySnippet[];
}) {
  const [findings, setFindings] = useState<SafetyFinding[]>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  async function choose(id: string) {
    setSelected(id);
    setBusy(true);
    setError(false);
    setFindings(undefined);
    try {
      setFindings(await snippetSafetyApi.findings(workspaceId, id));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5" aria-label="Saved safety findings">
      <h2 className="text-xl font-semibold">Saved safety findings</h2>
      <p className="text-sm">
        You have read-only access. An editor or owner can review and save snippets.
      </p>
      {snippets.length ? (
        <Select
          label="Snippet findings"
          disabled={busy}
          options={snippets.map((s) => ({ value: s.id, label: s.title }))}
          onValueChange={(id) => void choose(id)}
        />
      ) : (
        <EmptyState
          title="No snippets yet"
          description="An editor or owner can save a reviewed snippet."
        />
      )}
      <SafetyButton
        variant="secondary"
        disabled={busy || !selected}
        onClick={() => void choose(selected)}
      >
        Refresh findings
      </SafetyButton>
      {busy && <p role="status">Loading findings…</p>}
      {error && <p role="alert">Findings unavailable. Refresh findings to retry.</p>}
      {findings && <Findings findings={findings} />}
    </section>
  );
}
function Composer({
  workspaceId,
  snippets,
  saved,
}: {
  workspaceId: string;
  snippets: SafetySnippet[];
  saved: () => void;
}) {
  const [form, setForm] = useState<SnippetFields>(blank);
  const [existing, setExisting] = useState<SafetySnippet>();
  const [review, setReview] = useState<{ content: SnippetFields; findings: SafetyFinding[] }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<SnippetFields | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const raw = pending;
    return () => {
      raw.current = null;
    };
  }, []);
  function editAgain() {
    pending.current = null;
    setReview(undefined);
    setError('');
    requestKey.current = crypto.randomUUID();
  }
  function choose(id: string) {
    editAgain();
    const item = snippets.find((s) => s.id === id);
    setExisting(item);
    setForm(
      item
        ? {
            title: item.title,
            code: item.code,
            language: item.language,
            description: item.description || '',
          }
        : blank,
    );
  }
  async function preview() {
    setBusy(true);
    setError('');
    try {
      pending.current = { ...form };
      const local = preflightSnippet(form);
      setForm(local.content); // Detected text is removed from the rendered fields before any capture/notice.
      const result = await snippetSafetyApi.preflight(workspaceId, pending.current);
      setReview(result);
      setForm(result.content);
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch {
      pending.current = null;
      setError('Preflight unavailable. Nothing was saved. Check access and try again.');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!review || !pending.current) return;
    setBusy(true);
    setError('');
    try {
      const result = await snippetSafetyApi.save(
        workspaceId,
        pending.current,
        requestKey.current,
        existing,
      );
      pending.current = null;
      toast.success('Reviewed snippet saved', { id: 'snippet-safety' });
      setForm({
        title: result.snippet.title,
        code: result.snippet.code,
        language: result.snippet.language,
        description: result.snippet.description || '',
      });
      setReview(undefined);
      saved();
    } catch {
      setError(
        'Save failed. Nothing is confirmed. Retry this save, or reload snippets if the edit is stale.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Snippet safety editor" className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <SafetyButton variant="secondary" disabled={busy} onClick={() => choose('')}>
          New snippet
        </SafetyButton>
        <div className="min-w-0 flex-1">
          <Select
            label="Edit existing snippet"
            disabled={busy}
            value={existing?.id || ''}
            options={snippets.map((s) => ({ value: s.id, label: s.title }))}
            onValueChange={choose}
            placeholder="Choose an existing snippet to edit"
          />
        </div>
      </div>
      {!snippets.length && (
        <p className="text-sm text-muted-foreground">
          No snippets yet. Your first save will appear in this workspace.
        </p>
      )}
      <form
        className="space-y-5"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          if (!review && !busy) void preview();
        }}
        autoComplete="off"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span>Snippet title</span>
            <Input
              required
              maxLength={200}
              value={form.title}
              disabled={busy}
              readOnly={Boolean(review)}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Language</span>
            <Input
              required
              maxLength={50}
              value={form.language}
              disabled={busy}
              readOnly={Boolean(review)}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </label>
        </div>
        <label className="block space-y-2 text-sm">
          <span>Description</span>
          <Textarea
            maxLength={1000}
            value={form.description || ''}
            disabled={busy}
            readOnly={Boolean(review)}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Code</span>
          <Textarea
            required
            maxLength={256 * 1024}
            rows={10}
            className="font-mono"
            spellCheck={false}
            value={form.code}
            disabled={busy}
            readOnly={Boolean(review)}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        {!review && (
          <SafetyButton type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Review preflight'}
          </SafetyButton>
        )}
      </form>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {review && (
        <section aria-label="Preflight review" className="space-y-5 rounded-lg bg-secondary p-4">
          <h2 ref={resultHeading} tabIndex={-1} className="text-xl font-semibold">
            Review the redacted result
          </h2>
          <Findings findings={review.findings} />
          <p className="text-sm leading-6">
            Only the masked content shown above will be stored and queued for indexing. Removed
            values cannot be recovered here. This does not revoke credentials or clean older copies.
          </p>
          <div className="flex flex-wrap gap-3">
            <SafetyButton disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save redacted snippet'}
            </SafetyButton>
            <SafetyButton variant="secondary" disabled={busy} onClick={editAgain}>
              Edit masked draft
            </SafetyButton>
          </div>
        </section>
      )}
    </section>
  );
}
