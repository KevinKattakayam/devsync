'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { z } from 'zod';
import api from '@/lib/api';
import { Button, Input } from '@/components/ui';
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
export function GroundedAssistant({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return (
    <GroundedPreview key={`${user?.id || 'signed-out'}:${workspaceId}`} workspaceId={workspaceId} />
  );
}
export function GroundedPreview({ workspaceId }: { workspaceId: string }) {
  const [prompt, setPrompt] = useState(''),
    [purpose, setPurpose] = useState('qa'),
    [result, setResult] = useState<z.infer<typeof preview> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const base = (api.defaults.baseURL || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  async function generate() {
    setResult(null);
    setError('');
    setBusy(true);
    try {
      const response = await api.post(
        '/v3/ai/grounded',
        { workspaceId, prompt, purpose },
        { baseURL: base },
      );
      const parsed = preview.parse(response.data);
      if (alive.current) setResult(parsed);
    } catch {
      if (alive.current)
        setError(
          'Grounded AI unavailable, allowance exhausted, or response rejected. Check AI usage in settings and retry. No work was created.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function open(s: z.infer<typeof source>) {
    try {
      const response = await api.get(
        `/v2/workspaces/${encodeURIComponent(workspaceId)}/search/source`,
        { baseURL: base, params: { type: s.type, id: s.id } },
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
        setError('Source unavailable. Request a fresh preview.');
      }
    }
  }
  return (
    <section aria-label="Grounded assistant" className="space-y-3 rounded-lg border p-3">
      <p>Workspace evidence and draft proposals</p>
      <label>
        Purpose
        <select
          disabled={busy}
          aria-label="Purpose"
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value);
            setResult(null);
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
      <Input
        aria-label="Evidence question"
        disabled={busy}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={4000}
      />
      <Button
        type="button"
        disabled={busy || prompt.trim().length < 2 || !workspaceId}
        onClick={() => void generate()}
      >
        {busy ? 'Preparing preview…' : 'Generate evidence preview'}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p>{result.notice}</p>
          <p>
            Provider cost unavailable.
            {result.latencyMs !== undefined ? ` Request latency: ${result.latencyMs} ms.` : ''}
          </p>
          {result.claims.map((c, i) => (
            <p key={i}>
              {c.text} [{c.references.join(', ')}]
            </p>
          ))}
          {result.proposals.map((p, i) => (
            <article key={i}>
              <strong>
                Draft {p.kind}: {p.kind === 'link' ? `[${p.source}] → [${p.target}]` : p.title}
              </strong>
              <p>
                {p.description || p.rationale || p.reason} [{p.references.join(', ')}]
              </p>
              <p>
                Review and create manually in the existing workspace workflow. This preview has not
                saved work.
              </p>
            </article>
          ))}
          {result.sources.map((s) => (
            <Button
              type="button"
              variant="secondary"
              key={s.reference}
              onClick={() => void open(s)}
            >
              [{s.reference}] {s.title} — indexed {s.indexedAt}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
