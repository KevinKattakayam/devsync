'use client';
import { useState } from 'react';
import api, { boardApi, githubRepositoryApi } from '@/lib/api';
import { z } from 'zod';
import { decisionApi } from '@/lib/decision-receipts';
import { Badge, Button, Input } from '@/components/ui';
type Event = {
  id: string;
  kind: string;
  evidence: string;
  taskId: string | null;
  occurredAt: string;
  recordedAt: string;
  createdBy: string;
  taskTitle: string | null;
  taskUpdatedAt: string | null;
  repositoryOwner: string | null;
  repositoryName: string | null;
  pullNumber: number | null;
  pullState: string | null;
  pullProviderAt: string | null;
  pullObservedAt: string | null;
  githubEvidence: {
    kind: string;
    subject: string;
    state: string;
    conclusion: string | null;
    providerAt: string;
    observedAt: string;
    headSha: string | null;
  }[];
};
function eventLabel(kind: string) {
  switch (kind) {
    case 'human_assertion':
      return 'Human assertion';
    case 'outcome_confirmed':
      return 'Outcome confirmed by human';
    case 'linked_task':
      return 'Linked task';
    case 'linked_pull_request':
      return 'Linked pull request';
    default:
      return 'Recorded evidence';
  }
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Time unavailable';
}
export function ExecutionTimeline({
  workspaceId,
  receiptId,
  canWrite,
  owner,
}: {
  workspaceId: string;
  receiptId: string;
  canWrite: boolean;
  owner: boolean;
}) {
  const [items, setItems] = useState<Event[] | null>(null),
    [error, setError] = useState(''),
    [evidence, setEvidence] = useState(''),
    [kind, setKind] = useState('human_assertion'),
    [taskId, setTaskId] = useState(''),
    [repositoryId, setRepositoryId] = useState(''),
    [pullNumber, setPullNumber] = useState(''),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [tasks, setTasks] = useState<{ id: string; title: string }[]>([]),
    [repositories, setRepositories] = useState<{ id: string; owner: string; name: string }[]>([]);
  const path = `${decisionApi.path(workspaceId)}/${encodeURIComponent(receiptId)}/timeline`;
  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.get<Event[]>(path);
      setItems(result.data);
      setError('');
    } catch {
      setItems(null);
      setError('Timeline unavailable.');
    } finally {
      setLoading(false);
    }
  }
  async function chooseKind(value: string) {
    setKind(value);
    setTaskId('');
    setRepositoryId('');
    setTasks([]);
    setRepositories([]);
    setError('');
    try {
      if (value === 'linked_task') {
        const boards = z
          .array(
            z.object({
              columns: z.array(
                z.object({ tasks: z.array(z.object({ id: z.string(), title: z.string() })) }),
              ),
            }),
          )
          .parse((await boardApi.list(workspaceId)).data);
        setTasks(boards.flatMap((board) => board.columns.flatMap((column) => column.tasks)));
      }
      if (value === 'linked_pull_request' && owner) {
        const entries = z
          .array(z.object({ id: z.string(), owner: z.string(), name: z.string() }))
          .parse((await githubRepositoryApi.list(workspaceId)).data);
        setRepositories(entries);
      }
    } catch {
      setItems(null);
      setTasks([]);
      setRepositories([]);
      setError('Could not load available work.');
    }
  }
  async function add() {
    if (saving) return;
    setSaving(true);
    try {
      await api.post(path, {
        kind,
        evidence,
        ...(kind === 'linked_task' ? { taskId } : {}),
        ...(kind === 'linked_pull_request' ? { repositoryId, pullNumber: Number(pullNumber) } : {}),
        occurredAt: new Date().toISOString(),
      });
      setEvidence('');
      await load();
    } catch {
      setItems(null);
      setError('Could not record evidence.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-label="Execution timeline" className="space-y-2">
      <Button variant="secondary" pending={loading} onClick={() => void load()}>
        Load execution timeline
      </Button>
      {error && <p role="alert">{error}</p>}
      {items && (
        <>
          {items.length === 0 ? (
            <p className="rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
              No execution evidence has been recorded for this decision yet.
            </p>
          ) : (
            <ol aria-label="Execution evidence and links" className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="min-w-0 space-y-3 rounded-lg bg-card p-4 text-sm [overflow-wrap:anywhere]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{eventLabel(item.kind)}</Badge>
                    {item.pullState && <Badge tone="success">Verified GitHub PR event</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap leading-6">{item.evidence}</p>
                  {(item.kind === 'human_assertion' || item.kind === 'outcome_confirmed') && (
                    <p className="text-xs text-muted-foreground">
                      Human-recorded evidence; this is not provider verification.
                    </p>
                  )}
                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>
                      Occurred <time dateTime={item.occurredAt}>{dateLabel(item.occurredAt)}</time>
                    </p>
                    <p>
                      Recorded <time dateTime={item.recordedAt}>{dateLabel(item.recordedAt)}</time>
                    </p>
                  </div>
                  {item.taskId && item.taskTitle && (
                    <div className="rounded-md bg-secondary p-3">
                      <p className="text-xs font-medium text-muted-foreground">Task destination</p>
                      <a
                        className="mt-1 inline-block text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        href={`/workspace/${encodeURIComponent(workspaceId)}/kanban`}
                        aria-label={`Open task board for ${item.taskTitle}`}
                      >
                        {item.taskTitle}
                      </a>
                      {item.taskUpdatedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Updated{' '}
                          <time dateTime={item.taskUpdatedAt}>{dateLabel(item.taskUpdatedAt)}</time>
                        </p>
                      )}
                    </div>
                  )}
                  {item.repositoryOwner && item.repositoryName && item.pullNumber && (
                    <a
                      className="inline-block text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href={`https://github.com/${encodeURIComponent(item.repositoryOwner)}/${encodeURIComponent(item.repositoryName)}/pull/${item.pullNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.repositoryOwner}/${item.repositoryName} pull request ${item.pullNumber} on GitHub`}
                    >
                      {item.repositoryOwner}/{item.repositoryName} · PR #{item.pullNumber} ↗
                    </a>
                  )}
                  {(item.githubEvidence?.length > 0 || item.pullState) && (
                    <section aria-label="Verified GitHub webhook evidence" className="space-y-2">
                      {item.pullState && (
                        <div className="rounded-md border border-border p-3">
                          <p className="font-medium">Signed webhook record: PR {item.pullState}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Provider time{' '}
                            {item.pullProviderAt ? (
                              <time dateTime={item.pullProviderAt}>
                                {dateLabel(item.pullProviderAt)}
                              </time>
                            ) : (
                              'unavailable'
                            )}
                            {' · '}Received{' '}
                            {item.pullObservedAt ? (
                              <time dateTime={item.pullObservedAt}>
                                {dateLabel(item.pullObservedAt)}
                              </time>
                            ) : (
                              'unavailable'
                            )}
                          </p>
                        </div>
                      )}
                      {item.githubEvidence?.map((record, index) => (
                        <div
                          key={`${record.kind}:${record.subject}:${index}`}
                          className="rounded-md border border-border p-3"
                        >
                          <p className="font-medium">
                            Signed webhook record: {record.kind} {record.state}{' '}
                            {record.conclusion || ''}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Provider{' '}
                            <time dateTime={record.providerAt}>{dateLabel(record.providerAt)}</time>
                            {' · '}Received{' '}
                            <time dateTime={record.observedAt}>{dateLabel(record.observedAt)}</time>
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Provider record ID {record.subject}
                          </p>
                          {record.headSha && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Commit <code>{record.headSha.slice(0, 12)}</code>
                            </p>
                          )}
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        These are recorded webhook events, not a live GitHub query. No deployment is
                        inferred or verified here.
                      </p>
                    </section>
                  )}
                  <details className="text-xs text-muted-foreground">
                    <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      Provenance details
                    </summary>
                    <p className="mt-2 break-all">Recorded by member ID {item.createdBy}</p>
                  </details>
                </li>
              ))}
            </ol>
          )}
          {canWrite && (
            <fieldset disabled={saving} className="min-w-0 space-y-3 rounded-lg bg-secondary p-4">
              <legend className="px-1 text-sm font-semibold">Add evidence or a link</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Evidence type
                  <select value={kind} onChange={(e) => void chooseKind(e.target.value)}>
                    <option value="human_assertion">Human assertion</option>
                    <option value="linked_task">Linked task</option>
                    <option value="outcome_confirmed">Human confirmed outcome</option>
                    {owner && <option value="linked_pull_request">Linked pull request</option>}
                  </select>
                </label>
                {kind === 'linked_task' && (
                  <label>
                    Task
                    <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                      <option value="">Choose a task</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {kind === 'linked_pull_request' && (
                  <>
                    <label>
                      Repository
                      <select
                        value={repositoryId}
                        onChange={(e) => setRepositoryId(e.target.value)}
                      >
                        <option value="">Choose a repository</option>
                        {repositories.map((repo) => (
                          <option key={repo.id} value={repo.id}>
                            {repo.owner}/{repo.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pull request number
                      <Input
                        type="number"
                        min="1"
                        value={pullNumber}
                        onChange={(e) => setPullNumber(e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              <label className="block space-y-2 text-sm">
                Evidence description
                <textarea
                  rows={3}
                  className="ui-input"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <Button
                pending={saving}
                disabled={
                  !evidence.trim() ||
                  (kind === 'linked_task' && !taskId) ||
                  (kind === 'linked_pull_request' &&
                    (!repositoryId || !/^[1-9][0-9]*$/.test(pullNumber)))
                }
                onClick={() => void add()}
              >
                Record evidence
              </Button>
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}
