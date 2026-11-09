'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  const accessLost = useCallback(() => {
    serial.current++;
    setState({ error: true });
  }, []);
  const load = useCallback(
    async (cursor?: string) => {
      const token = ++serial.current;
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
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="inbox-heading"
      className="mx-auto max-w-5xl space-y-4 px-4 pb-12 md:px-8"
    >
      <h1 id="inbox-heading" className="text-xl font-semibold">
        Inbox
      </h1>
      <Link className="underline" href={`/workspace/${encodeURIComponent(workspaceId)}/digest`}>
        Back to digest
      </Link>
      <p className="text-sm text-muted-foreground">
        Recorded activity and assignments from your current digest window.
      </p>
      {state.error ? (
        <p role="alert">Inbox unavailable. Your access or the source may have changed.</p>
      ) : state.disabled ? (
        <p>Enable your digest to see the inbox.</p>
      ) : !state.page ? (
        <p role="status">Checking inbox access…</p>
      ) : !state.page.items.length ? (
        <p>No available events in this window.</p>
      ) : (
        <ol aria-label="Inbox events" className="divide-y divide-border">
          {state.page.items.map((item) => (
            <li key={item.activityId} className="space-y-2 py-4">
              <p>
                {item.category === 'assigned_task' ? 'Assigned task' : 'Workspace activity'} ·{' '}
                <strong>{item.read ? 'Read' : 'Unread'}</strong>
              </p>
              <p>{item.message}</p>
              <time dateTime={item.recordedAt}>{new Date(item.recordedAt).toLocaleString()}</time>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${item.read ? 'Mark unread' : 'Mark read'}: ${item.message}`}
                  onClick={() => void setRead(item.activityId, !item.read)}
                  className="underline"
                >
                  {item.read ? 'Mark unread' : 'Mark read'}
                </button>
                <Link
                  prefetch={false}
                  className="underline"
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
            </li>
          ))}
        </ol>
      )}
      {!!state.page?.automationFailures.length && (
        <div className="space-y-3">
          <h3 className="font-semibold">Failed automation</h3>
          <p className="text-sm">
            Owner view; shows failures among the latest 100 executions with available sources.
          </p>
          <ol aria-label="Failed automation executions" className="divide-y divide-border">
            {state.page.automationFailures.map((item) => (
              <li key={item.executionId} className="space-y-2 py-4">
                <p>
                  Automation execution failed · <strong>{item.read ? 'Read' : 'Unread'}</strong>
                </p>
                <time dateTime={item.recordedAt}>{new Date(item.recordedAt).toLocaleString()}</time>
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    className="underline"
                    aria-label={`${item.read ? 'Mark unread' : 'Mark read'}: failed execution ${item.executionId}`}
                    onClick={() => void setFailureRead(item.executionId, !item.read)}
                  >
                    {item.read ? 'Mark unread' : 'Mark read'}
                  </button>
                  <Link
                    prefetch={false}
                    className="underline"
                    href={`/workspace/${encodeURIComponent(workspaceId)}/settings`}
                  >
                    Open automation settings
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {state.page?.nextCursor && (
        <button
          type="button"
          onClick={() => {
            const cursor = state.page?.nextCursor ?? undefined;
            setState({});
            void load(cursor);
          }}
          className="underline"
        >
          Next inbox page
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setState({});
          void load();
        }}
        className="underline"
      >
        Refresh inbox
      </button>
      {state.page && <InboxPreferences workspaceId={workspaceId} onAccessLost={accessLost} />}
    </section>
  );
}
