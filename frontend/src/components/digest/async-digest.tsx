'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { Badge, Button, EmptyState, Skeleton, toast } from '@/components/ui';
import {
  digestApi,
  type DigestPage,
  type DigestPreference,
  type DigestItem,
} from '@/lib/async-digest';
function DigestButton({ className = '', ...props }: ComponentProps<typeof Button>) {
  return <Button {...props} className={`enabled:hover:opacity-100 ${className}`} />;
}
function Loading() {
  return (
    <div role="status" aria-label="Loading async digest" className="space-y-4">
      <span className="sr-only">Loading async digest</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
export function AsyncDigest({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return <Digest key={`${workspaceId}:${user?.id}`} workspaceId={workspaceId} />;
}
export function Digest({ workspaceId }: { workspaceId: string }) {
  const [attempt, setAttempt] = useState(0),
    [snapshot, setSnapshot] = useState<{
      attempt: number;
      preference?: DigestPreference;
      page?: DigestPage;
      error?: boolean;
    }>();
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const request = useRef(0),
    alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const presence = alive,
      serial = request;
    presence.current = true;
    return () => {
      presence.current = false;
      serial.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void digestApi
      .preference(workspaceId)
      .then(async (preference) => {
        const page = preference.enabled ? await digestApi.items(workspaceId) : undefined;
        if (active) setSnapshot({ attempt, preference, page });
      })
      .catch(() => {
        if (active) setSnapshot({ attempt, error: true });
      });
    return () => {
      active = false;
    };
  }, [workspaceId, attempt]);
  const refresh = () => {
    request.current++;
    setActionError('');
    setAttempt((v) => v + 1);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const preference = snapshot?.attempt === attempt ? snapshot.preference : undefined;
  const page = snapshot?.attempt === attempt ? snapshot.page : undefined;
  async function enabled(value: boolean) {
    if (!preference) return;
    setBusy(true);
    setActionError('');
    const token = ++request.current;
    try {
      await digestApi.setEnabled(workspaceId, value, preference.revision);
      if (alive.current && token === request.current) {
        refresh();
      }
    } catch {
      if (alive.current && token === request.current)
        setActionError(
          'Could not update your preference. Reload to check current access and retry.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function next() {
    if (!page?.nextCursor) return;
    setBusy(true);
    setActionError('');
    const token = ++request.current;
    try {
      const result = await digestApi.items(workspaceId, page.nextCursor);
      if (alive.current && token === request.current) {
        setSnapshot({ attempt, preference, page: result });
        requestAnimationFrame(() => heading.current?.focus());
      }
    } catch {
      if (alive.current && token === request.current)
        setActionError(
          'Could not load the next page. Retry or refresh if access or preferences changed.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function acknowledge() {
    const last = page?.items.at(-1);
    if (!last || !page) return;
    setBusy(true);
    setActionError('');
    const token = ++request.current;
    try {
      await digestApi.acknowledge(workspaceId, last.activityId, page.preferenceRevision);
      if (alive.current && token === request.current) {
        toast.success('Marked through this event as seen', { id: 'async-digest' });
        refresh();
      }
    } catch {
      if (alive.current && token === request.current)
        setActionError(
          'Could not mark these events seen. The source or your preferences may have changed. Refresh and retry.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-8 px-4 pt-8 pb-24 md:px-8" data-async-digest>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <h1 ref={heading} tabIndex={-1} className="text-[28px] font-semibold leading-9">
            Async digest
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Recorded workspace activity, with a source for every entry.
          </p>
        </div>
        <DigestButton variant="secondary" disabled={busy} onClick={refresh}>
          Refresh digest
        </DigestButton>
      </header>
      {!snapshot || snapshot.attempt !== attempt ? (
        <Loading />
      ) : snapshot.error ? (
        <div role="alert" className="space-y-4">
          <p>Digest unavailable. Your access or the feature configuration may have changed.</p>
          <DigestButton onClick={refresh}>Try again</DigestButton>
        </div>
      ) : !preference?.enabled ? (
        <section className="space-y-5">
          <h2 className="text-xl font-semibold">Your personal digest is off</h2>
          <p className="text-sm leading-6">
            Opt in to linked creation events from the last seven days. Your checkpoint is personal.
          </p>
          <DigestButton disabled={busy} onClick={() => void enabled(true)}>
            {busy ? 'Saving…' : 'Enable my digest'}
          </DigestButton>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge>Personal · evidence only</Badge>
            <DigestButton variant="secondary" disabled={busy} onClick={() => void enabled(false)}>
              Turn off my digest
            </DigestButton>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Document, snippet and task creation events only. Unlinked or unavailable sources are
            omitted; this is a partial history.
          </p>
          {page && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-2">Window (UTC)</summary>
              <p className="break-words py-2">
                {page.from} through {page.until}. Pages stay in chronological order within this
                window.
              </p>
            </details>
          )}
          {!page?.items.length ? (
            <EmptyState
              title="No eligible events in this window"
              description="This does not mean nothing happened. Older, unlinked or unavailable sources are not included. Refresh after new linked activity is recorded."
            />
          ) : (
            <>
              <ol aria-label="Recorded digest events" className="divide-y divide-border">
                {page.items.map((item) => (
                  <li
                    key={item.activityId}
                    className="min-w-0 space-y-3 py-6 [overflow-wrap:anywhere]"
                  >
                    <time dateTime={item.recordedAt} className="text-xs text-muted-foreground">
                      {new Date(item.recordedAt).toLocaleString()}
                    </time>
                    <p className="text-sm leading-6">{item.message}</p>
                    {item.masked && (
                      <p className="text-xs text-muted-foreground">
                        Sensitive-looking text was masked.
                      </p>
                    )}
                    <Link
                      className="inline-block text-sm text-primary underline underline-offset-4"
                      href={`/workspace/${encodeURIComponent(workspaceId)}/digest/activity/${encodeURIComponent(item.activityId)}`}
                    >
                      View recorded source
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {item.source.kind} · Recorded revision {item.source.revision}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-3">
                <DigestButton disabled={busy} onClick={() => void acknowledge()}>
                  {busy ? 'Working…' : 'Mark through this event as seen'}
                </DigestButton>
                {page.nextCursor && (
                  <DigestButton variant="secondary" disabled={busy} onClick={() => void next()}>
                    Next page
                  </DigestButton>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Marking seen advances your own chronological checkpoint, including earlier pages. It
                does not claim you verified the work. Refresh starts again after that checkpoint.
              </p>
            </>
          )}
        </>
      )}
      {actionError && (
        <p role="alert" className="text-sm">
          {actionError}
        </p>
      )}
    </div>
  );
}
export function DigestSource({
  workspaceId,
  activityId,
}: {
  workspaceId: string;
  activityId: string;
}) {
  const { user } = useAuth();
  return (
    <Source
      key={`${workspaceId}:${activityId}:${user?.id}`}
      workspaceId={workspaceId}
      activityId={activityId}
    />
  );
}
function Source({ workspaceId, activityId }: { workspaceId: string; activityId: string }) {
  const [attempt, setAttempt] = useState(0),
    [snapshot, setSnapshot] = useState<{ attempt: number; item?: DigestItem; error?: boolean }>();
  useEffect(() => {
    let active = true;
    void digestApi
      .event(workspaceId, activityId)
      .then((item) => {
        if (active) setSnapshot({ attempt, item });
      })
      .catch(() => {
        if (active) setSnapshot({ attempt, error: true });
      });
    return () => {
      active = false;
    };
  }, [workspaceId, activityId, attempt]);
  const item = snapshot?.attempt === attempt ? snapshot.item : undefined;
  const href = item
    ? `/workspace/${encodeURIComponent(workspaceId)}/${item.source.kind === 'document' ? `docs/${encodeURIComponent(item.source.id)}` : item.source.kind === 'task' ? 'kanban' : 'snippets'}`
    : '';
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6 px-4 pt-8 pb-24 md:px-8">
      <h1 className="text-[28px] font-semibold leading-9">Recorded activity source</h1>
      <Link
        href={`/workspace/${encodeURIComponent(workspaceId)}/digest`}
        className="inline-block text-sm text-primary underline underline-offset-4"
      >
        Back to digest
      </Link>
      {!snapshot || snapshot.attempt !== attempt ? (
        <Loading />
      ) : snapshot.error ? (
        <div role="alert" className="space-y-4">
          <p>This recorded source is unavailable or you no longer have access.</p>
          <DigestButton onClick={() => setAttempt((v) => v + 1)}>Try again</DigestButton>
        </div>
      ) : (
        item && (
          <article className="space-y-5 [overflow-wrap:anywhere]">
            <Badge>{item.eventType}</Badge>
            <p className="whitespace-pre-wrap text-base leading-7">{item.message}</p>
            {item.masked && (
              <p className="text-sm text-muted-foreground">Sensitive-looking text was masked.</p>
            )}
            <dl className="space-y-2 text-sm">
              <dt>Recorded time</dt>
              <dd>
                <time dateTime={item.recordedAt}>{item.recordedAt}</time>
              </dd>
              <dt>Activity ID</dt>
              <dd className="font-mono">{item.activityId}</dd>
              <dt>Source kind / ID</dt>
              <dd>
                {item.source.kind} · {item.source.id}
              </dd>
              <dt>Recorded source revision</dt>
              <dd>{item.source.revision}</dd>
            </dl>
            <Link
              href={href}
              className="inline-block text-sm text-primary underline underline-offset-4"
            >
              {item.source.kind === 'document'
                ? 'Open document'
                : item.source.kind === 'task'
                  ? 'Open task board'
                  : 'Open snippet vault'}
            </Link>
            <p className="text-sm leading-6 text-muted-foreground">
              This is a recorded event, not a current status claim or a historical content snapshot.
              The source may have changed since it was recorded. Task/snippet navigation opens its
              existing collection; the exact source ID is listed above.
            </p>
          </article>
        )
      )}
    </div>
  );
}
