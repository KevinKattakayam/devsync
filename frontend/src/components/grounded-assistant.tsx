'use client';

import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { BookOpen, ExternalLink, LoaderCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { z } from 'zod';
import api from '@/lib/api';
import { Button, Textarea } from '@/components/ui';

const source = z.object({
  reference: z.number(),
  type: z.enum(['document', 'task', 'snippet', 'decision', 'pull_request']),
  id: z.string(),
  title: z.string(),
  indexedAt: z.string(),
});
const preview = z.object({
  status: z.enum(['preview', 'insufficient_evidence']),
  claims: z.array(z.object({ text: z.string(), references: z.array(z.number()) })),
  proposals: z.array(
    z.object({
      kind: z.enum(['task', 'decision', 'link']),
      title: z.string().optional(),
      description: z.string().optional(),
      rationale: z.string().optional(),
      reason: z.string().optional(),
      source: z.number().optional(),
      target: z.number().optional(),
      references: z.array(z.number()),
    }),
  ),
  sources: z.array(source),
  notice: z.string(),
  latencyMs: z.number().optional(),
});
type Source = z.infer<typeof source>;
type Preview = z.infer<typeof preview>;

function safeRequestMessage(error: unknown) {
  if (!isAxiosError(error)) return 'The response could not be validated. No work was created.';
  switch (error.response?.status) {
    case 401:
      return 'Your session may have expired. Sign in again, then retry. No work was created.';
    case 403:
      return 'You do not have permission to request this preview in the current workspace. No work was created.';
    case 429:
      return 'The AI allowance is temporarily exhausted. Check AI usage in settings before retrying. No work was created.';
    case 503:
      return 'The grounded assistant is currently unavailable. Retry when the service is available. No work was created.';
    default:
      return 'The request failed or its response could not be validated. Check your connection and retry. No work was created.';
  }
}

export function GroundedAssistant({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return (
    <GroundedPreview key={`${user?.id || 'signed-out'}:${workspaceId}`} workspaceId={workspaceId} />
  );
}

export function GroundedPreview({ workspaceId }: { workspaceId: string }) {
  const [prompt, setPrompt] = useState('');
  const [purpose, setPurpose] = useState('qa');
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const base = (api.defaults.baseURL || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

  async function generate() {
    if (prompt.trim().length < 2 || !workspaceId || busy) return;
    setResult(null);
    setError('');
    setBusy(true);
    try {
      const response = await api.post(
        '/v3/ai/grounded',
        { workspaceId, prompt: prompt.trim(), purpose },
        { baseURL: base },
      );
      const parsed = preview.parse(response.data);
      const availableReferences = new Set(parsed.sources.map((item) => item.reference));
      if (
        parsed.claims.some((claim) =>
          claim.references.some((reference) => !availableReferences.has(reference)),
        ) ||
        parsed.proposals.some((proposal) =>
          proposal.references.some((reference) => !availableReferences.has(reference)),
        )
      )
        throw new Error('Unresolved citation');
      if (alive.current) setResult(parsed);
    } catch (requestError: unknown) {
      if (alive.current) setError(safeRequestMessage(requestError));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function open(sourceItem: Source) {
    try {
      const response = await api.get(
        `/v2/workspaces/${encodeURIComponent(workspaceId)}/search/source`,
        { baseURL: base, params: { type: sourceItem.type, id: sourceItem.id } },
      );
      const href = z
        .object({ results: z.array(z.object({ href: z.string() })).min(1) })
        .parse(response.data).results[0].href;
      if (!(
        href.startsWith(`/workspace/${encodeURIComponent(workspaceId)}/`) ||
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(href)
      ))
        throw new Error('Unavailable');
      if (alive.current) window.location.assign(href);
    } catch {
      if (alive.current) {
        setResult(null);
        setError('This source is no longer available to you. Request a fresh preview.');
      }
    }
  }

  function Citation({ reference }: { reference: number }) {
    const citedSource = result?.sources.find((item) => item.reference === reference);
    if (!citedSource)
      return <span className="font-medium text-muted-foreground">[{reference}]</span>;
    return (
      <Button
        type="button"
        variant="ghost"
        size="compact"
        className="mx-0.5 inline-flex h-7 min-h-7 px-2 align-baseline text-primary underline-offset-2 hover:underline"
        aria-label={`Open cited source ${reference}: ${citedSource.title}`}
        onClick={() => void open(citedSource)}
      >
        [{reference}]
      </Button>
    );
  }

  return (
    <section
      aria-labelledby="grounded-assistant-title"
      className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id="grounded-assistant-title" className="text-base font-semibold leading-6">
            Grounded workspace preview
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">
            Ask about indexed workspace sources. Responses can be incomplete or incorrect; cited
            excerpts are evidence to review, not verified truth.
          </p>
        </div>
      </header>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label className="block space-y-1.5 text-sm font-medium" htmlFor="grounded-purpose">
          <span>What do you need?</span>
          <select
            id="grounded-purpose"
            disabled={busy}
            className="ui-input w-full"
            value={purpose}
            onChange={(event) => {
              setPurpose(event.target.value);
              setResult(null);
              setError('');
            }}
          >
            {Object.entries({
              qa: 'Workspace Q&A',
              summary: 'Cited summary',
              meeting_tasks: 'Meeting task drafts',
              pr_brief: 'Recorded PR brief',
              risk: 'Risk explanation',
              decision: 'Decision draft',
              link: 'Link proposal',
            }).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="grounded-question">
            Your question or request
          </label>
          <Textarea
            id="grounded-question"
            aria-describedby="grounded-question-help grounded-question-count"
            disabled={busy}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (error) setError('');
            }}
            maxLength={4000}
            rows={3}
            placeholder="Ask about workspace material…"
            className="min-h-24 w-full resize-y leading-6"
          />
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span id="grounded-question-help">
              Uses accessible indexed sources available to you.
            </span>
            <span id="grounded-question-count" aria-live="off">
              {prompt.length}/4000
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            pending={busy}
            disabled={busy || prompt.trim().length < 2 || !workspaceId}
          >
            {busy ? 'Preparing preview…' : error ? 'Retry preview' : 'Generate preview'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Draft suggestions are not saved. Review and create them yourself.
          </p>
        </div>
      </form>

      {busy && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Searching authorized workspace sources and preparing a preview…
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm"
        >
          <p>{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider details are not shown here. Source access is checked again when you open a
            citation.
          </p>
        </div>
      )}

      {result && (
        <section aria-label="Grounded preview result" className="min-w-0 space-y-4 border-t pt-4">
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {result.status === 'insufficient_evidence'
              ? 'Not enough accessible evidence'
              : 'Preview ready'}
          </p>
          <div className="rounded-lg bg-secondary/60 p-3 text-sm leading-6">
            <p>{result.notice}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              AI output is not independently verified. Provider cost is unavailable.
              {result.latencyMs !== undefined ? ` Request latency: ${result.latencyMs} ms.` : ''}
            </p>
          </div>

          {result.claims.length > 0 && (
            <section aria-label="Cited response" className="space-y-2">
              <h3 className="text-sm font-semibold">Response with citations</h3>
              <ol className="space-y-2">
                {result.claims.map((claim, index) => (
                  <li
                    key={`${index}-${claim.text}`}
                    className="rounded-lg border p-3 text-sm leading-6"
                  >
                    <p className="break-words">{claim.text}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span>Cited sources:</span>
                      {claim.references.map((reference) => (
                        <Citation key={reference} reference={reference} />
                      ))}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {result.proposals.length > 0 && (
            <section aria-label="Reviewable draft suggestions" className="space-y-2">
              <h3 className="text-sm font-semibold">Draft suggestions · review before using</h3>
              {result.proposals.map((proposal, index) => (
                <article key={`${index}-${proposal.kind}`} className="rounded-lg border p-3">
                  <h4 className="text-sm font-semibold">
                    Draft {proposal.kind}:{' '}
                    {proposal.kind === 'link'
                      ? `[${proposal.source}] → [${proposal.target}]`
                      : proposal.title}
                  </h4>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                    {proposal.description || proposal.rationale || proposal.reason}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>Evidence:</span>
                    {proposal.references.map((reference) => (
                      <Citation key={reference} reference={reference} />
                    ))}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nothing was saved. Create any accepted draft through the existing workspace
                    workflow.
                  </p>
                </article>
              ))}
            </section>
          )}

          {result.sources.length > 0 ? (
            <section aria-label="Available cited sources" className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen aria-hidden="true" className="size-4 text-muted-foreground" />
                Sources available when previewed
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.sources.map((item) => (
                  <li key={item.reference}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-auto min-h-12 w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left"
                      onClick={() => void open(item)}
                    >
                      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        <span className="font-medium">
                          [{item.reference}] {item.title}
                        </span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {item.type.replace('_', ' ')} · indexed{' '}
                          <time dateTime={item.indexedAt}>{item.indexedAt}</time>
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Current membership and source visibility are checked again when a source is opened.
              </p>
            </section>
          ) : result.status === 'insufficient_evidence' ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Try a narrower question with terms used in a document, task, decision or recorded PR.
            </p>
          ) : null}
        </section>
      )}
    </section>
  );
}
