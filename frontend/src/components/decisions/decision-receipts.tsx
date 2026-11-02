'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { loadWorkspaceAccess } from '@/lib/workspace-access';
import {
  decisionApi,
  type DecisionReceipt,
  type ReceiptContent,
  type ReceiptSource,
  type ReceiptSourceDetail,
} from '@/lib/decision-receipts';
import { errorMessage } from '@/lib/errors';
// Keep semantic token contrast on hover; shared opacity fading reduces light-theme AA contrast.
function ReceiptButton({ className = '', ...props }: ComponentProps<typeof Button>) {
  return <Button {...props} className={`enabled:hover:opacity-100 ${className}`} />;
}
type Access = Awaited<ReturnType<typeof loadWorkspaceAccess>>;
export function DecisionReceipts({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return <Receipts key={`${workspaceId}:${user?.id}`} workspaceId={workspaceId} />;
}
export function Receipts({ workspaceId }: { workspaceId: string }) {
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else heading.current?.focus();
    });
  };
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    attempt: number;
    access?: Access;
    items?: DecisionReceipt[];
    error?: boolean;
  }>();
  const [form, setForm] = useState<DecisionReceipt | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{
    item: DecisionReceipt;
    action: 'delete' | 'accept' | 'supersede';
  } | null>(null);
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');
  const refresh = () => setAttempt((v) => v + 1);
  useEffect(() => {
    let active = true;
    void Promise.all([loadWorkspaceAccess(workspaceId), decisionApi.list(workspaceId)])
      .then(([access, items]) => {
        if (active) setSnapshot({ attempt, access, items });
      })
      .catch(() => {
        if (active) setSnapshot({ attempt, error: true });
      });
    return () => {
      active = false;
    };
  }, [workspaceId, attempt]);
  const ready = snapshot?.attempt === attempt && snapshot.access && snapshot.items;
  if (!ready)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <h1 ref={heading} tabIndex={-1} className="text-[28px] font-semibold">
          Decision receipts
        </h1>
        {snapshot?.attempt === attempt && snapshot.error ? (
          <div role="alert" className="mt-6 space-y-4">
            <p>
              Decision receipts are unavailable. Your access may have changed, or the feature may be
              disabled.
            </p>
            <ReceiptButton onClick={refresh}>Try again</ReceiptButton>
          </div>
        ) : (
          <div role="status" aria-label="Loading decision receipts" className="mt-8 space-y-4">
            <span className="sr-only">Loading decision receipts</span>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </div>
    );
  const { access, items } = snapshot;
  if (!access || !items) return null;
  const canWrite = access.role !== 'VIEWER',
    owner = access.role === 'OWNER';
  const displayName = (id: string | null) =>
    access.workspace.members.find((m) => m.user.id === id)?.user.name || 'Former member';
  const filtered = items.filter((r) =>
    `${r.title} ${r.rationale} ${r.status} ${r.sourceTitle}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function confirmAction() {
    if (!confirm) return;
    setBusy(true);
    setActionError('');
    try {
      const { item, action } = confirm;
      if (action === 'delete') await decisionApi.remove(workspaceId, item.id, item.revision);
      if (action === 'accept') await decisionApi.accept(workspaceId, item.id, item.revision);
      if (action === 'supersede')
        await decisionApi.supersede(workspaceId, item.id, item.revision, replacement);
      setConfirm(null);
      toast.success(
        action === 'delete'
          ? 'Draft deleted'
          : action === 'accept'
            ? 'Decision accepted'
            : 'Decision superseded',
      );
      refresh();
    } catch (error) {
      setActionError(errorMessage(error, 'Action failed. Refresh to check the current receipt.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto min-w-0 max-w-5xl px-4 pt-8 pb-24 md:px-8" data-decisions>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1} className="text-[28px] font-semibold leading-9">
            Decision receipts
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep the reason, the source and the person who accepted it. Drafts are proposals, not
            agreement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReceiptButton variant="secondary" onClick={refresh}>
            Refresh receipts
          </ReceiptButton>
          {canWrite && (
            <ReceiptButton
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                setForm('new');
              }}
            >
              New receipt
            </ReceiptButton>
          )}
        </div>
      </header>
      {!canWrite && (
        <p className="mb-6 text-sm text-muted-foreground">
          You have read-only access. Editors can draft receipts; owners accept and supersede
          decisions.
        </p>
      )}
      <label className="mb-6 block space-y-2 text-sm">
        <span>Search receipts</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, rationale, source or status"
        />
      </label>
      <p className="mb-6 text-xs text-muted-foreground">
        Up to 200 receipts per workspace. Unavailable or archived sources are omitted. Source
        changes require review.
      </p>
      {items.length === 0 ? (
        <EmptyState
          title="Keep your first decision"
          description="Choose a document or task, quote the evidence and explain the tradeoff. An owner can then accept the decision."
          action={
            canWrite ? (
              <ReceiptButton
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                  setForm('new');
                }}
              >
                Create a receipt
              </ReceiptButton>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching receipts"
          description="Try another title, source or status."
          action={
            <ReceiptButton variant="secondary" onClick={() => setQuery('')}>
              Clear search
            </ReceiptButton>
          }
        />
      ) : (
        <div className="space-y-8">
          {filtered.map((item) => (
            <article
              key={item.id}
              id={`receipt-${item.id}`}
              aria-label={item.title}
              className="min-w-0 space-y-4 border-b border-border pb-8 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Badge>
                  {item.status === 'DRAFT'
                    ? 'Draft'
                    : item.status === 'ACCEPTED'
                      ? 'Accepted'
                      : 'Superseded'}
                </Badge>
                {item.sourceChanged && <Badge tone="warning">Source changed · review needed</Badge>}
                <span className="text-xs text-muted-foreground">Revision {item.revision}</span>
              </div>
              <h2 className="text-xl font-semibold">{item.title}</h2>
              <p className="whitespace-pre-wrap text-sm leading-6">{item.rationale}</p>
              <blockquote className="whitespace-pre-wrap border-l-2 border-input pl-4 text-sm leading-6">
                {item.excerpt}
              </blockquote>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Source:{' '}
                  <Link
                    className="text-primary underline underline-offset-4"
                    href={`/workspace/${workspaceId}/${item.sourceKind === 'document' ? `docs/${item.sourceId}` : 'kanban'}`}
                  >
                    {item.sourceTitle}
                  </Link>{' '}
                  · {item.sourceKind}
                </p>
                <p className="break-all">Pinned source revision: {item.sourceRevision}</p>
                <p>
                  Proposed by {displayName(item.createdBy)}
                  {item.acceptedAt
                    ? ` · Accepted by ${displayName(item.acceptedBy)} on ${new Date(item.acceptedAt).toLocaleString()}`
                    : ' · Awaiting owner acceptance'}
                </p>
              </div>
              {item.status === 'SUPERSEDED' &&
                (item.supersededById ? (
                  <a
                    className="inline-block text-sm text-primary underline underline-offset-4"
                    href={`#receipt-${item.supersededById}`}
                  >
                    Read replacement receipt
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Replacement source unavailable.</p>
                ))}
              <div className="flex flex-wrap gap-2">
                {canWrite && item.status === 'DRAFT' && (
                  <>
                    <ReceiptButton
                      variant="secondary"
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setForm(item);
                      }}
                    >
                      Edit draft
                    </ReceiptButton>
                    <ReceiptButton
                      variant="ghost"
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setActionError('');
                        setConfirm({ item, action: 'delete' });
                      }}
                    >
                      Delete draft
                    </ReceiptButton>
                  </>
                )}
                {owner && item.status === 'DRAFT' && (
                  <ReceiptButton
                    disabled={item.sourceChanged}
                    onClick={(event) => {
                      returnFocus.current = event.currentTarget;
                      setActionError('');
                      setConfirm({ item, action: 'accept' });
                    }}
                  >
                    Accept decision
                  </ReceiptButton>
                )}
                {owner && item.status === 'ACCEPTED' && (
                  <ReceiptButton
                    variant="secondary"
                    onClick={(event) => {
                      returnFocus.current = event.currentTarget;
                      setReplacement('');
                      setActionError('');
                      setConfirm({ item, action: 'supersede' });
                    }}
                  >
                    Supersede decision
                  </ReceiptButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={restoreFocus}
          title={form === 'new' ? 'New decision receipt' : 'Edit decision draft'}
          description="Quote a current document or task. Saving creates a proposal; only an owner can accept it."
          className="max-h-[90dvh] overflow-y-auto"
        >
          {form && (
            <ReceiptForm
              key={typeof form === 'string' ? 'new' : form.id}
              workspaceId={workspaceId}
              initial={typeof form === 'string' ? undefined : form}
              close={() => setForm(null)}
              saved={refresh}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={restoreFocus}
          title={
            confirm?.action === 'delete'
              ? 'Delete this draft?'
              : confirm?.action === 'accept'
                ? 'Accept this decision?'
                : 'Supersede this decision?'
          }
          description={
            confirm?.action === 'delete'
              ? 'This removes an unaccepted draft. Accepted decisions are retained.'
              : confirm?.action === 'accept'
                ? 'You are recording your explicit acceptance as a workspace owner. This freezes the quote and rationale.'
                : 'Choose an accepted replacement. The original remains readable with a replacement link.'
          }
        >
          {confirm?.action === 'supersede' && (
            <Select
              label="Replacement receipt"
              value={replacement}
              onValueChange={setReplacement}
              options={items
                .filter(
                  (r) => r.id !== confirm.item.id && r.status === 'ACCEPTED' && !r.sourceChanged,
                )
                .map((r) => ({ value: r.id, label: r.title }))}
            />
          )}
          {confirm?.action === 'supersede' &&
            !items.some(
              (r) => r.id !== confirm.item.id && r.status === 'ACCEPTED' && !r.sourceChanged,
            ) && <p className="mt-4 text-sm">Create and accept a current replacement first.</p>}
          {actionError && (
            <p role="alert" className="mt-4 text-sm">
              {actionError}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <ReceiptButton variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </ReceiptButton>
            <ReceiptButton
              variant={confirm?.action === 'delete' ? 'destructive' : 'primary'}
              disabled={busy || (confirm?.action === 'supersede' && !replacement)}
              onClick={() => void confirmAction()}
            >
              {busy
                ? 'Saving…'
                : confirm?.action === 'delete'
                  ? 'Delete draft'
                  : confirm?.action === 'accept'
                    ? 'Confirm acceptance'
                    : 'Confirm supersession'}
            </ReceiptButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ReceiptForm({
  workspaceId,
  initial,
  close,
  saved,
}: {
  workspaceId: string;
  initial?: DecisionReceipt;
  close: () => void;
  saved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [rationale, setRationale] = useState(initial?.rationale || '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt || '');
  const [sources, setSources] = useState<ReceiptSource[]>([]);
  const [source, setSource] = useState<ReceiptSourceDetail>();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef({ key: crypto.randomUUID(), payload: '' });
  const version = useRef(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      decisionApi.sources(workspaceId),
      initial
        ? decisionApi.source(workspaceId, initial.sourceKind, initial.sourceId)
        : Promise.resolve(undefined),
    ])
      .then(([choices, detail]) => {
        if (active) {
          setSources(choices);
          setSource(detail);
        }
      })
      .catch(() => {
        if (active) setError('Sources unavailable. Try finding sources again.');
      })
      .finally(() => {
        if (active) setSourceBusy(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, initial]);
  async function findSources() {
    setSourceBusy(true);
    setError('');
    try {
      setSources(await decisionApi.sources(workspaceId, search));
    } catch {
      setError('Sources unavailable. Try finding sources again.');
    } finally {
      setSourceBusy(false);
    }
  }
  async function choose(value: string) {
    const selected = sources.find((s) => `${s.kind}:${s.id}` === value);
    if (!selected) return;
    const current = ++version.current;
    setSourceBusy(true);
    setSource(undefined);
    setError('');
    try {
      const result = await decisionApi.source(workspaceId, selected.kind, selected.id);
      if (version.current === current) {
        setSource(result);
        setExcerpt(result.text.slice(0, 5000));
      }
    } catch {
      if (version.current === current) setError('Source unavailable. Refresh the source list.');
    } finally {
      if (version.current === current) setSourceBusy(false);
    }
  }
  async function submit() {
    if (!source) return;
    setBusy(true);
    setError('');
    const content: ReceiptContent = {
      title,
      rationale,
      excerpt,
      sourceId: source.id,
      sourceKind: source.kind,
      sourceRevision: source.revision,
    };
    const payload = JSON.stringify(content);
    if (request.current.payload !== payload)
      request.current = { key: crypto.randomUUID(), payload };
    try {
      const result = initial
        ? await decisionApi.edit(workspaceId, initial.id, content, initial.revision)
        : await decisionApi.create(workspaceId, content, request.current.key);
      toast.success(initial ? 'Draft updated' : 'Draft created', {
        action: {
          label: 'Undo',
          onClick: () => {
            void (
              initial
                ? decisionApi.edit(
                    workspaceId,
                    result.id,
                    {
                      title: initial.title,
                      rationale: initial.rationale,
                      sourceId: initial.sourceId,
                      sourceKind: initial.sourceKind,
                      sourceRevision: initial.sourceRevision,
                      excerpt: initial.excerpt,
                    },
                    result.revision,
                  )
                : decisionApi.remove(workspaceId, result.id, result.revision)
            )
              .then(saved)
              .catch(() =>
                toast.error('Undo failed. The draft may have changed; refresh receipts.'),
              );
          },
        },
      });
      saved();
      close();
    } catch (e) {
      setError(errorMessage(e, 'Could not save the draft. Review the source and try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-busy={busy}
    >
      <div className="space-y-2">
        <label className="block text-sm" htmlFor="receipt-source-search">
          Find a source by title
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="receipt-source-search"
            className="min-w-0 flex-1"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ReceiptButton
            type="button"
            variant="secondary"
            disabled={sourceBusy || busy}
            onClick={() => void findSources()}
          >
            Find sources
          </ReceiptButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Up to 50 documents and 50 tasks per search. Refine the title to find more.
        </p>
      </div>
      <Select
        label="Decision source"
        disabled={busy || sourceBusy}
        value={source ? `${source.kind}:${source.id}` : ''}
        onValueChange={(value) => void choose(value)}
        options={[
          ...(source && !sources.some((s) => s.kind === source.kind && s.id === source.id)
            ? [source]
            : []),
          ...sources,
        ].map((s) => ({ value: `${s.kind}:${s.id}`, label: `${s.title} · ${s.kind}` }))}
      />
      {sourceBusy && (
        <p role="status" className="text-sm">
          Loading sources…
        </p>
      )}
      {!sourceBusy && sources.length === 0 && (
        <p className="text-sm">
          No sources found. Create a document or task, or try another title.
        </p>
      )}
      {source && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Current source text</h3>
          <p
            className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-sm leading-6 [overflow-wrap:anywhere]"
            tabIndex={0}
          >
            {source.text}
          </p>
          <p className="text-xs text-muted-foreground">
            Plain text preview, first 64,000 characters. Quote a matching passage below.
          </p>
        </div>
      )}
      <label className="block space-y-2 text-sm">
        <span>Decision title</span>
        <Input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>Source quote</span>
        <Textarea
          required
          maxLength={5000}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          disabled={busy || !source}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>Rationale and tradeoffs</span>
        <Textarea
          required
          maxLength={8000}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <ReceiptButton type="button" variant="secondary" disabled={busy} onClick={close}>
          Cancel
        </ReceiptButton>
        <ReceiptButton type="submit" disabled={busy || sourceBusy || !source}>
          {busy ? 'Saving…' : 'Save draft'}
        </ReceiptButton>
      </div>
    </form>
  );
}
