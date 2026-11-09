'use client';
import { useState } from 'react';
import api, { boardApi, githubRepositoryApi } from '@/lib/api';
import { z } from 'zod';
import { decisionApi } from '@/lib/decision-receipts';
import { Button, Input } from '@/components/ui';
type Event = {
  id: string;
  kind: string;
  evidence: string;
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
    [tasks, setTasks] = useState<{ id: string; title: string }[]>([]),
    [repositories, setRepositories] = useState<{ id: string; owner: string; name: string }[]>([]);
  const path = `${decisionApi.path(workspaceId)}/${encodeURIComponent(receiptId)}/timeline`;
  async function load() {
    try {
      const result = await api.get<Event[]>(path);
      setItems(result.data);
      setError('');
    } catch {
      setItems(null);
      setError('Timeline unavailable.');
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
    }
  }
  return (
    <section aria-label="Execution timeline" className="space-y-2">
      <Button variant="secondary" onClick={() => void load()}>
        Load execution timeline
      </Button>
      {error && <p role="alert">{error}</p>}
      {items && (
        <>
          <ul>
            {items.map((item) => (
              <li key={item.id} className="text-sm">
                <p>
                  {item.kind === 'outcome_confirmed'
                    ? 'Human confirmed outcome'
                    : item.kind.replaceAll('_', ' ')}
                  : {item.evidence}
                </p>
                <p>
                  Occurred {item.occurredAt} · Recorded {item.recordedAt} · By {item.createdBy}
                </p>
                {item.taskTitle && (
                  <p>
                    <a href={`/workspace/${encodeURIComponent(workspaceId)}/kanban`}>
                      Task: {item.taskTitle}
                    </a>{' '}
                    · Updated {item.taskUpdatedAt}
                  </p>
                )}
                {item.repositoryOwner && item.repositoryName && item.pullNumber && (
                  <p>
                    <a
                      href={`https://github.com/${encodeURIComponent(item.repositoryOwner)}/${encodeURIComponent(item.repositoryName)}/pull/${item.pullNumber}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open linked pull request #{item.pullNumber}
                    </a>
                  </p>
                )}
                {item.githubEvidence?.length > 0 && (
                  <p>Showing up to 100 recorded checks and reviews for this PR and commit.</p>
                )}
                {item.githubEvidence?.map((record, index) => (
                  <p key={`${record.kind}:${index}`}>
                    Signed webhook record: {record.kind} {record.state} {record.conclusion || ''} ·
                    ID {record.subject} · Provider {record.providerAt} · Received{' '}
                    {record.observedAt} · Commit {record.headSha || 'unknown'}.
                  </p>
                ))}
                {item.pullState && (
                  <p>
                    Signed webhook record: PR {item.pullState} · Provider {item.pullProviderAt} ·
                    Received {item.pullObservedAt}. Live GitHub access is unverified. No verified
                    deployment evidence is available.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {canWrite && (
            <div>
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
                    <select value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)}>
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
              <label>
                Evidence description
                <Input
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <Button
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
            </div>
          )}
        </>
      )}
    </section>
  );
}
