'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Skeleton } from '@/components/ui';
import { digestApi, type InboxPage } from '@/lib/async-digest';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import { InboxPreferences } from './inbox-preferences';

export function Inbox({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  return <InboxContent key={`${workspaceId}:${user?.id}`} workspaceId={workspaceId} />;
}
function InboxContent({ workspaceId }: { workspaceId: string }) {
  const { socket } = useSocket();
  const serial = useRef(0);
  const [state, setState] = useState<{ page?: InboxPage; error?: boolean; disabled?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const accessLost = useCallback(() => {
    serial.current++;
    setState({ error: true });
    setLoading(false);
  }, []);
  const load = useCallback(
    async (cursor?: string) => {
      const token = ++serial.current;
      setLoading(true);
      try {
        const preference = await digestApi.preference(workspaceId);
        const page = preference.enabled
          ? await Promise.all([
              digestApi.inbox(workspaceId, cursor),
              digestApi.automationFailures(workspaceId),
            ]).then(([items, failures]) => ({ ...items, automationFailures: failures.items }))
          : undefined;
        if (serial.current === token) setState(preference.enabled ? { page } : { disabled: true });
      } catch {
        if (serial.current === token) setState({ error: true });
      } finally {
        if (serial.current === token) setLoading(false);
      }
    },
    [workspaceId],
  );
  useEffect(() => {
    const generation = serial;
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    const refresh = () => {
      generation.current++;
      setState({});
      void load();
    };
    const clear = () => {
      generation.current++;
      setState({});
      setLoading(false);
    };
    const visibility = () => {
      if (document.hidden) clear();
      else refresh();
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', clear);
    window.addEventListener('focus', refresh);
    window.addEventListener('devsync:digest-preference-changed', refresh);
    document.addEventListener('visibilitychange', visibility);
    socket?.on('connect', refresh);
    socket?.on('disconnect', clear);
    socket?.on('workspace:suspended', clear);
    return () => {
      active = false;
      generation.current++;
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', clear);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('devsync:digest-preference-changed', refresh);
      document.removeEventListener('visibilitychange', visibility);
      socket?.off('connect', refresh);
      socket?.off('disconnect', clear);
      socket?.off('workspace:suspended', clear);
    };
  }, [load, socket]);
  async function setRead(id: string, read: boolean) {
    setBusy(true);
    try {
      await digestApi.setRead(workspaceId, id, read);
      await load();
    } catch {
      serial.current++;
      setState({ error: true });
      setLoading(false);
    } finally {
      setBusy(false);
    }
  }
  async function setFailureRead(id: string, read: boolean) {
    setBusy(true);
    try {
      await digestApi.setAutomationRead(workspaceId, id, read);
      await load();
    } catch {
      serial.current++;
      setState({ error: true });
      setLoading(false);
    } finally {
      setBusy(false);
    }
  }
  const page = state.page;
  const unreadCount = page
    ? page.items.filter((item) => !item.read).length +
      page.automationFailures.filter((item) => !item.read).length
    : 0;
  const assignedCount = page?.items.filter((item) => item.category === 'assigned_task').length ?? 0;
  const hasEvents = !!page && (page.items.length > 0 || page.automationFailures.length > 0);
  const timestamp = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Time unavailable';
  };
  return (
    <section
      aria-labelledby="inbox-heading"
      className="mx-auto max-w-5xl space-y-6 px-4 pb-12 md:px-8"
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspace updates
          </p>
          <h1 id="inbox-heading" className="text-2xl font-semibold tracking-tight">
            Inbox
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Activity and assignments recorded for your current digest window. Priority labels are
            not provided by these events. Items can disappear if your access or the source changes.
          </p>
          <Link
            className="inline-block rounded-sm text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={`/workspace/${encodeURIComponent(workspaceId)}/digest`}
          >
            Back to digest
          </Link>
        </div>
        <Button
          variant="secondary"
          pending={loading}
          onClick={() => {
            setState({});
            void load();
          }}
          className="w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
        >
          Refresh inbox
        </Button>
      </header>
      {page && (
        <section
          aria-label="Inbox summary"
          className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary p-3"
        >
          <Badge>{unreadCount} unread</Badge>
          <Badge>{page.items.length} activity items</Badge>
          {assignedCount > 0 && <Badge>{assignedCount} assigned tasks</Badge>}
          {page.automationFailures.length > 0 && (
            <Badge tone="destructive">
              {page.automationFailures.length} failed automation
              {page.automationFailures.length === 1 ? '' : 's'}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {timestamp(page.from)} – {timestamp(page.until)}
          </span>
        </section>
      )}
      {state.error ? (
        <div role="alert" className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">Inbox unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your access or a linked source may have changed. Refresh to check current access.
            </p>
          </div>
          <Button
            variant="secondary"
            pending={loading}
            onClick={() => void load()}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Retry inbox
          </Button>
        </div>
      ) : state.disabled ? (
        <div role="status" className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Your inbox is paused</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable the existing digest preference to view recorded workspace activity.
          </p>
          <Link
            className="mt-3 inline-block rounded-sm text-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={`/workspace/${encodeURIComponent(workspaceId)}/digest`}
          >
            Open digest settings
          </Link>
        </div>
      ) : !state.page ? (
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 rounded-lg border border-border p-5"
        >
          <span className="sr-only">Checking inbox access</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !hasEvents ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-card px-5 py-8 text-center"
        >
          <h2 className="font-semibold">You’re all caught up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No available activity in this digest window.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {!!page?.items.length && (
            <section aria-labelledby="activity-heading" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="activity-heading" className="text-lg font-semibold">
                    Your activity
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Assigned tasks and other recorded workspace activity.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {page.items.length} {page.items.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <ol aria-label="Inbox events" className="space-y-3">
                {page.items.map((item) => (
                  <li key={item.activityId}>
                    <article
                      aria-label={`${item.category === 'assigned_task' ? 'Assigned task' : 'Workspace activity'}: ${item.message}`}
                      className={`min-w-0 rounded-lg border bg-card p-4 sm:p-5 ${item.read ? 'border-border' : 'border-l-4 border-l-primary border-y-border border-r-border'}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>
                              {item.category === 'assigned_task'
                                ? 'Assigned task'
                                : 'Workspace activity'}
                            </Badge>
                            <Badge tone={item.read ? 'neutral' : 'warning'}>
                              {item.read ? 'Read' : 'Unread'}
                            </Badge>
                          </div>
                          <p className="break-words text-sm leading-6">{item.message}</p>
                          <time
                            className="block text-xs text-muted-foreground"
                            dateTime={item.recordedAt}
                          >
                            Recorded {timestamp(item.recordedAt)}
                          </time>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="compact"
                            disabled={busy || loading}
                            aria-label={`${item.read ? 'Mark unread' : 'Mark read'}: ${item.message}`}
                            onClick={() => void setRead(item.activityId, !item.read)}
                            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {item.read ? 'Mark unread' : 'Mark read'}
                          </Button>
                          <Link
                            prefetch={false}
                            className="inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            aria-label={`${item.source.kind === 'document' ? 'Open document' : item.source.kind === 'task' ? 'Open task board' : 'Open snippet vault'}: ${item.message}`}
                            href={`/workspace/${encodeURIComponent(workspaceId)}/${item.source.kind === 'document' ? `docs/${encodeURIComponent(item.source.id)}` : item.source.kind === 'task' ? 'kanban' : 'snippets'}`}
                          >
                            {item.source.kind === 'document'
                              ? 'Open document'
                              : item.source.kind === 'task'
                                ? 'Open task board'
                                : 'Open snippet vault'}
                          </Link>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      {!!state.page?.automationFailures.length && (
        <section aria-labelledby="automation-heading" className="space-y-3">
          <div>
            <h2 id="automation-heading" className="text-lg font-semibold">
              Failed automation
            </h2>
            <p className="text-sm text-muted-foreground">
              Owner view; shows failures among the latest 100 executions with available sources.
            </p>
          </div>
          <ol aria-label="Failed automation executions" className="space-y-3">
            {state.page.automationFailures.map((item) => (
              <li key={item.executionId}>
                <article
                  aria-label={`Failed automation execution ${item.executionId}`}
                  className="rounded-lg border border-border bg-card p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="destructive">Automation failure</Badge>
                        <Badge tone={item.read ? 'neutral' : 'warning'}>
                          {item.read ? 'Read' : 'Unread'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">Automation execution failed</p>
                      <time
                        className="block text-xs text-muted-foreground"
                        dateTime={item.recordedAt}
                      >
                        Recorded {timestamp(item.recordedAt)}
                      </time>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={busy || loading}
                        aria-label={`${item.read ? 'Mark unread' : 'Mark read'}: failed execution ${item.executionId}`}
                        onClick={() => void setFailureRead(item.executionId, !item.read)}
                        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {item.read ? 'Mark unread' : 'Mark read'}
                      </Button>
                      <Link
                        prefetch={false}
                        className="inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        href={`/workspace/${encodeURIComponent(workspaceId)}/settings`}
                      >
                        Open automation settings
                      </Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </section>
      )}
      {state.page?.nextCursor && (
        <Button
          variant="secondary"
          disabled={busy || loading}
          onClick={() => {
            const cursor = state.page?.nextCursor ?? undefined;
            setState({});
            void load(cursor);
          }}
        >
          Next inbox page
        </Button>
      )}
      {state.page && <InboxPreferences workspaceId={workspaceId} onAccessLost={accessLost} />}
    </section>
  );
}
