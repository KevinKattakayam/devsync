'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckSquare, FileText, Folder, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Badge, Button, EmptyState, Select, toast } from '@/components/ui';
import { CreateWorkspace } from '@/components/dashboard/create-workspace';
import { DashboardError, DashboardLoading } from '@/components/dashboard/dashboard-states';
import {
  assignedTasks,
  loadDashboard,
  recentDocuments,
  type DashboardOverview,
  type WorkspaceOverview,
} from '@/lib/dashboard-data';
import {
  dashboardDocumentRequests,
  startUndoableDocument,
  type CreatedDashboardDocument,
} from '@/lib/undoable-document';

function dateLabel(value: string) {
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))
    : 'Date unavailable';
}
function Panel({
  title,
  children,
  detail,
}: {
  title: string;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {children}
    </section>
  );
}
interface Draft {
  receipt: string;
  workspace: WorkspaceOverview['workspace'];
  state: 'creating' | 'saved' | 'error';
  document?: CreatedDashboardDocument;
}
export default function DashboardPage() {
  const { user } = useAuth();
  return user ? <Dashboard key={user.id} /> : <DashboardLoading />;
}
function Dashboard() {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    attempt: number;
    data?: DashboardOverview;
    error?: boolean;
  }>();
  const [scope, setScope] = useState('all');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [hiddenDocuments, setHiddenDocuments] = useState<string[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    void loadDashboard()
      .then((data) => {
        if (!disposed) setSnapshot({ attempt, data });
      })
      .catch(() => {
        if (!disposed) setSnapshot({ attempt, error: true });
      });
    return () => {
      disposed = true;
    };
  }, [attempt]);
  const retry = () => setAttempt((value) => value + 1);
  if (!snapshot || snapshot.attempt !== attempt) return <DashboardLoading />;
  if (!snapshot.data || snapshot.error)
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <h1 className="mb-6 text-[28px] font-semibold leading-9">Your dashboard</h1>
        <DashboardError retry={retry} />
      </div>
    );
  const data = snapshot.data;
  const activeScope =
    scope === 'all' || data.workspaces.some((item) => item.workspace.id === scope) ? scope : 'all';
  const visible = data.workspaces.filter(
    (item) => activeScope === 'all' || item.workspace.id === activeScope,
  );
  const writer = visible.find(
    (item) => item.workspace.role === 'OWNER' || item.workspace.role === 'EDITOR',
  )?.workspace;
  const recent = recentDocuments(visible).filter(
    (document) => !hiddenDocuments.includes(document.id),
  );
  const visibleDrafts = drafts.filter(
    (draft) =>
      (activeScope === 'all' || draft.workspace.id === activeScope) &&
      !recent.some((document) => document.id === draft.document?.id),
  );
  const tasks = assignedTasks(visible, data.userId);
  const activities = visible
    .flatMap((item) =>
      item.activities.map((activity) => ({ ...activity, workspace: item.workspace })),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);
  const failures = visible.flatMap((item) =>
    item.failures.map((kind) => `${kind} in ${item.workspace.name}`),
  );
  function createDocument(
    workspace: WorkspaceOverview['workspace'],
    receipt = crypto.randomUUID(),
  ) {
    const update = (fn: (items: Draft[]) => Draft[]) => {
      if (mounted.current) setDrafts(fn);
    };
    let hidden = false;
    update((items) => [
      ...items.filter((item) => item.receipt !== receipt),
      { receipt, workspace, state: 'creating' },
    ]);
    const operation = startUndoableDocument(dashboardDocumentRequests(workspace.id, receipt), {
      committed: (document) => {
        update((items) =>
          items.map((item) =>
            item.receipt === receipt ? { ...item, state: 'saved', document } : item,
          ),
        );
        toast.success('Document created', {
          id: receipt,
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: () => {
              void operation.undo();
            },
          },
        });
      },
      hidden: () => {
        hidden = true;
        const document = operation.getDocument();
        if (document && mounted.current) setHiddenDocuments((ids) => [...ids, document.id]);
        update((items) => items.filter((item) => item.receipt !== receipt));
      },
      undone: () => {
        toast.success('Document creation undone', { id: receipt });
      },
      failed: (stage, document) => {
        if (stage === 'create') {
          if (!hidden)
            update((items) =>
              items.map((item) => (item.receipt === receipt ? { ...item, state: 'error' } : item)),
            );
          toast.error('Document could not be created', { id: receipt });
        } else {
          if (document && mounted.current)
            setHiddenDocuments((ids) => ids.filter((id) => id !== document.id));
          update((items) => [
            ...items.filter((item) => item.receipt !== receipt),
            { receipt, workspace, state: 'saved', document },
          ]);
          toast.error('Undo failed. The document is still available.', {
            id: receipt,
            action: {
              label: 'Retry undo',
              onClick: () => {
                void operation.undo();
              },
            },
          });
        }
      },
    });
    toast.loading('Creating document…', {
      id: receipt,
      action: {
        label: 'Undo',
        onClick: () => {
          void operation.undo();
        },
      },
    });
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8" data-dashboard>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Your work, together</p>
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight">
            Welcome back, {data.name.split(' ')[0] || 'developer'}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Pick up a document, find your next task, or see what changed.
          </p>
        </div>
        <Button variant="ghost" aria-label="Refresh dashboard" onClick={retry}>
          <RefreshCw aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </header>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <label className="block w-full space-y-2 text-xs font-medium sm:w-64">
          <span>Show work from</span>
          <Select
            label="Dashboard workspace"
            value={activeScope}
            onValueChange={setScope}
            options={[
              { value: 'all', label: 'All workspaces' },
              ...data.workspaces.map((item) => ({
                value: item.workspace.id,
                label: item.workspace.name,
              })),
            ]}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3" aria-label="Quick actions">
          <Button
            disabled={!writer || visibleDrafts.some((item) => item.state === 'creating')}
            onClick={() => {
              if (writer) createDocument(writer);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            New document
          </Button>
          <CreateWorkspace onCreated={retry} />
        </div>
      </div>
      {!writer && data.workspaces.length > 0 && (
        <p className="mb-6 text-xs text-muted-foreground">
          Document creation is available in workspaces where you are an owner or editor.
        </p>
      )}
      {failures.length > 0 && (
        <div className="mb-8">
          <DashboardError
            retry={retry}
            title="Some work could not load"
            description={`Could not load ${failures.join('; ')}. Retry to check access and load the latest data.`}
          />
        </div>
      )}
      {data.workspaces.length === 0 ? (
        <div className="rounded-xl bg-card">
          <EmptyState
            icon={<Folder className="size-8" />}
            title="Make room for your next idea"
            description="Use New to create your first workspace. Then add a document or invite your team. Nothing is added until you choose."
          />
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-10">
              <Panel title="Recent documents" detail="By last update">
                {visibleDrafts.length === 0 && recent.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="size-6" />}
                    title="A fresh page awaits"
                    description={
                      failures.some((item) => item.startsWith('documents'))
                        ? 'Retry above to load your documents.'
                        : 'Documents you and your team update will appear here.'
                    }
                  />
                ) : (
                  <ul className="space-y-1" aria-label="Recent documents">
                    {visibleDrafts.map((draft) => (
                      <li key={draft.receipt} className="rounded-lg bg-card px-4 py-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            {draft.document ? (
                              <Link
                                className="block truncate text-sm font-medium hover:underline"
                                href={`/workspace/${draft.workspace.id}/docs/${draft.document.id}`}
                              >
                                {draft.document.title || 'Untitled document'}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium">Untitled document</p>
                            )}
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {draft.workspace.name}
                            </p>
                          </div>
                          {draft.state === 'creating' ? (
                            <span role="status" className="text-xs text-muted-foreground">
                              Creating…
                            </span>
                          ) : draft.state === 'error' ? (
                            <Button
                              size="compact"
                              variant="secondary"
                              onClick={() => createDocument(draft.workspace, draft.receipt)}
                            >
                              Retry creation
                            </Button>
                          ) : (
                            <Badge>Just created</Badge>
                          )}
                        </div>
                        {draft.state === 'error' && (
                          <p role="alert" className="mt-2 text-xs text-destructive">
                            Could not create this document. Retry or refresh the dashboard.
                          </p>
                        )}
                      </li>
                    ))}
                    {recent.map((document) => (
                      <li key={document.id}>
                        <Link
                          href={`/workspace/${document.workspace.id}/docs/${document.id}`}
                          className="group flex min-w-0 items-center gap-3 rounded-lg px-4 py-3 hover:bg-secondary"
                        >
                          <FileText
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {document.title || 'Untitled document'}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {document.workspace.name}
                            </p>
                          </div>
                          <time
                            dateTime={document.updatedAt}
                            className="shrink-0 text-xs text-muted-foreground"
                          >
                            {dateLabel(document.updatedAt || '')}
                          </time>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel
                title="Assigned to you"
                detail={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
              >
                {tasks.length === 0 ? (
                  <EmptyState
                    icon={<CheckSquare className="size-6" />}
                    title="Nothing assigned to you"
                    description={
                      failures.some((item) => item.startsWith('tasks'))
                        ? 'Retry above to load your tasks.'
                        : 'Tasks assigned to your account will appear here. Open a workspace board to plan with your team.'
                    }
                  />
                ) : (
                  <ul className="space-y-1" aria-label="Assigned tasks">
                    {tasks.slice(0, 6).map((task) => (
                      <li key={task.id}>
                        <Link
                          href={`/workspace/${task.workspace.id}/kanban`}
                          className="flex min-w-0 items-start gap-3 rounded-lg px-4 py-3 hover:bg-secondary"
                        >
                          <CheckSquare
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">{task.title}</p>
                            <p className="mt-1 break-words text-xs text-muted-foreground">
                              {task.workspace.name} · {task.column}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {task.dueDate ? `Due ${dateLabel(task.dueDate)}` : 'No due date'}
                            </p>
                          </div>
                          <Badge
                            tone={
                              task.priority === 'HIGH' || task.priority === 'URGENT'
                                ? 'warning'
                                : 'neutral'
                            }
                          >
                            {task.priority.toLowerCase()}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <aside aria-label="Workspace updates" className="min-w-0 space-y-10">
              <Panel title="Activity" detail="Latest updates">
                {activities.length === 0 ? (
                  <EmptyState
                    title="Quiet for now"
                    description={
                      failures.some((item) => item.startsWith('activity'))
                        ? 'Retry above to load recent activity.'
                        : 'Workspace activity will appear as your team makes changes.'
                    }
                  />
                ) : (
                  <ol className="space-y-5" aria-label="Recent activity">
                    {activities.map((activity) => (
                      <li key={activity.id} className="flex min-w-0 gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <div className="min-w-0">
                          <p className="break-words text-sm leading-6">{activity.message}</p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {activity.workspace.name} · {activity.user.name}
                          </p>
                          <time
                            dateTime={activity.createdAt}
                            className="mt-1 block text-xs text-muted-foreground"
                          >
                            {dateLabel(activity.createdAt)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
              <Panel title="Workspaces">
                <ul className="space-y-1">
                  {data.workspaces.map(({ workspace }) => (
                    <li key={workspace.id}>
                      <Link
                        href={`/workspace/${workspace.id}`}
                        className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 hover:bg-secondary"
                      >
                        <Folder
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{workspace.name}</span>
                        <span className="text-xs capitalize text-muted-foreground">
                          {workspace.role?.toLowerCase()}
                        </span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
