'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import api, { workspaceApi } from '@/lib/api';
import { Button, Input } from '@/components/ui';
const itemSchema = z.object({
  type: z.enum(['document', 'task', 'snippet', 'decision', 'pull_request']),
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  updatedAt: z.iso.datetime(),
  indexedAt: z.iso.datetime(),
  freshness: z.literal('current_projection'),
  method: z.literal('lexical'),
  href: z.string(),
  score: z.number(),
});
const pageSchema = z.object({
  results: z.array(itemSchema),
  retrievedAt: z.iso.datetime(),
  semantic: z.literal('not_requested'),
});
type Item = z.infer<typeof itemSchema>;
const memberSchema = z.object({
  members: z.array(z.object({ user: z.object({ id: z.string(), name: z.string().nullable() }) })),
});
export function KnowledgeSearch({ workspaceId }: { workspaceId: string }) {
  const [q, setQ] = useState(''),
    [type, setType] = useState(''),
    [assignee, setAssignee] = useState(''),
    [after, setAfter] = useState(''),
    [before, setBefore] = useState('');
  const [items, setItems] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [searched, setSearched] = useState(false);
  const generation = useRef(0);
  const [members, setMembers] = useState<{ id: string; name: string | null }[]>([]);
  const [memberError, setMemberError] = useState(false);
  useEffect(() => {
    let disposed = false;
    void workspaceApi
      .get(workspaceId)
      .then((response) => {
        const data = memberSchema.parse(response.data);
        if (!disposed) setMembers(data.members.map((member) => member.user));
      })
      .catch(() => {
        if (!disposed) setMemberError(true);
      });
    return () => {
      disposed = true;
    };
  }, [workspaceId]);
  const base = (api.defaults.baseURL || '/api/v1').replace(/\/api(?:\/v1)?\/?$/, '/api/v2');
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/search`;
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    const clear = () => {
      generation.current++;
      setItems([]);
      setBusy(false);
      setSearched(false);
    };
    window.addEventListener('focus', clear);
    const hidden = () => {
      if (document.visibilityState === 'hidden') clear();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      invalidate();
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [workspaceId]);
  async function search(event: FormEvent) {
    event.preventDefault();
    const current = ++generation.current;
    setItems([]);
    setError('');
    setBusy(true);
    setSearched(false);
    try {
      const result = pageSchema.parse(
        (
          await api.get(path, {
            baseURL: base,
            params: {
              q,
              type: type || undefined,
              assigneeId: assignee || undefined,
              after: after ? new Date(`${after}Z`).toISOString() : undefined,
              before: before ? new Date(`${before}Z`).toISOString() : undefined,
            },
          })
        ).data,
      );
      if (current === generation.current) {
        setItems(result.results);
        setSearched(true);
      }
    } catch {
      if (current === generation.current)
        setError('Search unavailable. Check access and filters, then retry.');
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function open(item: Item) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = pageSchema.parse(
        (
          await api.get(`${path}/source`, {
            baseURL: base,
            params: { type: item.type, id: item.id },
          })
        ).data,
      );
      if (current !== generation.current) return;
      const href = result.results[0]?.href;
      if (
        !href ||
        !(
          href.startsWith(`/workspace/${encodeURIComponent(workspaceId)}/`) ||
          /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(href)
        )
      )
        throw new Error('Unavailable');
      window.location.assign(href);
    } catch {
      if (current === generation.current) {
        setItems([]);
        setSearched(false);
        setError('Source unavailable. Search again to refresh your access.');
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-4xl space-y-6 p-6" aria-label="Knowledge search">
      <header>
        <h1 className="text-2xl font-semibold">Search knowledge</h1>
        <p className="text-sm text-muted-foreground">
          Lexical search across current authorized work. No AI key required. Unsaved or
          unacknowledged local edits are not searchable.
        </p>
      </header>
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          Search text
          <Input
            value={q}
            minLength={2}
            maxLength={500}
            required
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          Source type
          <select
            className="block w-full rounded-md border bg-background p-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All authorized sources</option>
            {[
              ['document', 'Documents'],
              ['task', 'Tasks'],
              ['snippet', 'Snippets'],
              ['decision', 'Decision receipts'],
              ['pull_request', 'Recorded PR metadata (owners)'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee (tasks only)
          <select
            className="block w-full rounded-md border bg-background p-2"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            disabled={memberError}
          >
            <option value="">{memberError ? 'Member list unavailable' : 'All assignees'}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || 'Workspace member'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Updated after (UTC)
          <Input type="datetime-local" value={after} onChange={(e) => setAfter(e.target.value)} />
        </label>
        <label>
          Updated before (UTC)
          <Input type="datetime-local" value={before} onChange={(e) => setBefore(e.target.value)} />
        </label>
        <Button type="submit" disabled={busy}>
          Search knowledge
        </Button>
      </form>
      {busy && <p role="status">Checking current access…</p>}
      {error && <p role="alert">{error}</p>}
      {searched && !items.length && <p role="status">No matching authorized sources.</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={`${item.type}:${item.id}`} className="space-y-2 rounded-lg border p-4">
            <h2 className="font-medium">{item.title}</h2>
            <p className="whitespace-pre-wrap text-sm">{item.preview}</p>
            <p className="text-xs text-muted-foreground">
              {item.type} · Lexical · Current committed projection · Indexed{' '}
              <time dateTime={item.indexedAt}>{item.indexedAt}</time> · Source updated{' '}
              <time dateTime={item.updatedAt}>{item.updatedAt}</time>
            </p>
            {item.type === 'pull_request' && (
              <p className="text-xs text-muted-foreground">
                Recorded webhook metadata; current GitHub access is unverified.
              </p>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => void open(item)}>
              Open {item.title}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
