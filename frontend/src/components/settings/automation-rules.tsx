'use client';
import { useRef, useState } from 'react';
import { z } from 'zod';
import api, { boardApi, githubRepositoryApi } from '@/lib/api';
import { Button, Input } from '@/components/ui';
const ruleSchema = z.object({
  id: z.string(),
  title: z.string(),
  trigger: z.enum(['task_review', 'blocker', 'pr_merged', 'ci_passed']),
  action: z.enum(['notify', 'escalate', 'prepare_report', 'update_linked_status']),
  condition: z.enum(['always', 'high_priority']),
  debounceSeconds: z.number().int(),
  enabled: z.boolean(),
  version: z.number().int(),
});
type Rule = z.infer<typeof ruleSchema>;
const executionsSchema = z.array(
  z.object({
    id: z.string(),
    ruleId: z.string(),
    status: z.enum([
      'pending_approval',
      'approved',
      'completed',
      'unavailable',
      'cancelled',
      'failed',
    ]),
    current: z.boolean(),
    origin: z.enum(['human_assertion', 'signed_webhook']),
    trigger: z.string(),
    action: z.enum(['notify', 'escalate', 'prepare_report', 'update_linked_status']),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('task'), title: z.string(), actorId: z.string() }),
      z.object({
        kind: z.literal('github'),
        repository: z.string(),
        subject: z.string(),
        providerAt: z.string(),
        observedAt: z.string(),
        liveAccess: z.literal('not_verified'),
      }),
    ]),
    errorCode: z.string().nullable(),
    createdAt: z.string(),
    report: z
      .object({
        kind: z.literal('signed_webhook_record'),
        repository: z.string(),
        pullNumber: z.number().int(),
        providerAt: z.string(),
        observedAt: z.string(),
        liveAccess: z.literal('not_verified'),
      })
      .nullable()
      .optional(),
    audit: z.array(
      z.object({ kind: z.string(), actorId: z.string().nullable(), createdAt: z.string() }),
    ),
  }),
);
const tasksSchema = z.array(
  z.object({
    columns: z.array(z.object({ tasks: z.array(z.object({ id: z.string(), title: z.string() })) })),
  }),
);
const repositoriesSchema = z.array(
  z.object({ id: z.string(), owner: z.string(), name: z.string() }),
);
const recordedEventsSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(['pull_request', 'check_run', 'review']),
      subject: z.string(),
      state: z.string(),
      conclusion: z.string().nullable(),
      providerAt: z.string(),
    }),
  ),
  liveAccess: z.enum(['not_verified', 'disconnected']),
});
const actions = {
  task_review: 'notify',
  blocker: 'escalate',
  pr_merged: 'prepare_report',
  ci_passed: 'update_linked_status',
} as const;
const triggerLabels = {
  task_review: 'Review request (human assertion)',
  blocker: 'Blocker (human assertion)',
  pr_merged: 'Recorded PR merge',
  ci_passed: 'Recorded successful check (unverified)',
} as const;
const actionLabels = {
  notify: 'Post review notice to activity',
  escalate: 'Post blocker to activity',
  prepare_report: 'Prepare signed-event report',
  update_linked_status: 'Update linked status after verified CI',
} as const;
export function AutomationRules({
  workspaceId,
  owner,
  members = [],
}: {
  workspaceId: string;
  owner: boolean;
  members?: { user: { id: string; name: string | null } }[];
}) {
  const [rules, setRules] = useState<Rule[] | null>(null),
    [title, setTitle] = useState(''),
    [trigger, setTrigger] = useState<keyof typeof actions>('task_review'),
    [condition, setCondition] = useState<'always' | 'high_priority'>('always'),
    [debounceSeconds, setDebounceSeconds] = useState(30),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const base = (api.defaults.baseURL || '/api/v1').replace(/\/api(?:\/v1)?\/?$/, '/api/v2');
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/automation`;
  const receipt = useRef<{ payload: string; key: string } | null>(null);
  const eventReceipt = useRef<{ payload: string; key: string } | null>(null);
  const [executions, setExecutions] = useState<z.infer<typeof executionsSchema>>([]),
    [selected, setSelected] = useState<Rule | null>(null),
    [tasks, setTasks] = useState<{ id: string; title: string }[]>([]),
    [taskId, setTaskId] = useState(''),
    [preview, setPreview] = useState<boolean | null>(null),
    [previewReason, setPreviewReason] = useState('');
  const [repositories, setRepositories] = useState<z.infer<typeof repositoriesSchema>>([]),
    [repositoryId, setRepositoryId] = useState(''),
    [recorded, setRecorded] = useState<z.infer<typeof recordedEventsSchema>['items']>([]),
    [subject, setSubject] = useState(''),
    [disconnected, setDisconnected] = useState(false);
  function clearSensitive() {
    setRules(null);
    setExecutions([]);
    setSelected(null);
    setTasks([]);
    setTaskId('');
    setPreview(null);
    setRepositories([]);
    setRepositoryId('');
    setRecorded([]);
    setSubject('');
    setDisconnected(false);
  }
  async function refreshExecutions() {
    setExecutions(
      executionsSchema.parse((await api.get(`${path}/executions`, { baseURL: base })).data),
    );
  }
  async function load() {
    setBusy(true);
    setError('');
    try {
      setRules(z.array(ruleSchema).parse((await api.get(path, { baseURL: base })).data));
      if (owner) await refreshExecutions();
    } catch {
      clearSensitive();
      setError('Automation rules are unavailable. Check your current workspace access.');
    } finally {
      setBusy(false);
    }
  }
  async function choose(rule: Rule) {
    setBusy(true);
    setError('');
    setPreview(null);
    setTaskId('');
    setSelected(rule);
    try {
      if (rule.trigger === 'task_review' || rule.trigger === 'blocker') {
        const boards = tasksSchema.parse((await boardApi.list(workspaceId)).data);
        setTasks(boards.flatMap((b) => b.columns.flatMap((c) => c.tasks)));
      } else
        setRepositories(
          repositoriesSchema.parse((await githubRepositoryApi.list(workspaceId)).data),
        );
    } catch {
      clearSensitive();
      setError('Tasks are unavailable. Check your access.');
    } finally {
      setBusy(false);
    }
  }
  async function chooseRepository(id: string) {
    setRepositoryId(id);
    setRecorded([]);
    setSubject('');
    setPreview(null);
    setDisconnected(false);
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const data = recordedEventsSchema.parse(
        (
          await api.get(
            `/workspaces/${encodeURIComponent(workspaceId)}/github-repositories/${encodeURIComponent(id)}/execution`,
            { baseURL: base },
          )
        ).data,
      );
      setRecorded(data.items);
      setDisconnected(data.liveAccess === 'disconnected');
    } catch {
      clearSensitive();
      setError('Repository evidence is unavailable. Check your access.');
    } finally {
      setBusy(false);
    }
  }
  async function checkPreview() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const result = z
        .object({ eligible: z.boolean(), requiresApproval: z.literal(true), reason: z.string() })
        .parse(
          (
            await api.post(
              `${path}/preview`,
              selected.trigger === 'task_review' || selected.trigger === 'blocker'
                ? { ruleId: selected.id, trigger: selected.trigger, taskId }
                : { ruleId: selected.id, trigger: selected.trigger, repositoryId, subject },
              { baseURL: base },
            )
          ).data,
        );
      setPreview(result.eligible);
      setPreviewReason(result.reason);
    } catch {
      clearSensitive();
      setError('Preview unavailable. Check your current access.');
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!selected || !preview) return;
    setBusy(true);
    setError('');
    const payload = { trigger: selected.trigger, taskId },
      encoded = JSON.stringify(payload);
    if (eventReceipt.current?.payload !== encoded)
      eventReceipt.current = { payload: encoded, key: crypto.randomUUID() };
    try {
      await api.post(`${path}/events`, payload, {
        baseURL: base,
        headers: { 'Idempotency-Key': eventReceipt.current.key },
      });
      eventReceipt.current = null;
      setPreview(null);
      setSelected(null);
      await refreshExecutions();
    } catch {
      clearSensitive();
      setError('Event could not be submitted. Check your access and retry.');
    } finally {
      setBusy(false);
    }
  }
  async function approve(id: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(`${path}/executions/${encodeURIComponent(id)}/approve`, {}, { baseURL: base });
      await refreshExecutions();
    } catch {
      clearSensitive();
      setError('Approval unavailable. Reload to check access and source state.');
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError('');
    const payload = { title, trigger, action: actions[trigger], condition, debounceSeconds };
    const encoded = JSON.stringify(payload);
    if (receipt.current?.payload !== encoded)
      receipt.current = { payload: encoded, key: crypto.randomUUID() };
    try {
      const item = ruleSchema.parse(
        (
          await api.post(path, payload, {
            baseURL: base,
            headers: { 'Idempotency-Key': receipt.current.key },
          })
        ).data,
      );
      setRules((previous) => [...(previous || []), item]);
      setTitle('');
      receipt.current = null;
    } catch {
      clearSensitive();
      setError('Could not create rule. Check your current workspace access.');
    } finally {
      setBusy(false);
    }
  }
  async function setEnabled(rule: Rule, enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      const updated = ruleSchema.parse(
        (
          await api.patch(
            `${path}/${encodeURIComponent(rule.id)}/enabled`,
            { enabled, expectedVersion: rule.version },
            { baseURL: base },
          )
        ).data,
      );
      setRules(
        (previous) => previous?.map((item) => (item.id === updated.id ? updated : item)) || null,
      );
    } catch {
      clearSensitive();
      setError('Rule could not be changed. Check your current workspace access.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Automation rules" className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Automation rules</h2>
      <p>
        Task events are human assertions. Each matching execution requires an owner’s approval.
        Completed task notices are posted to workspace activity; external delivery is not
        configured. Approved requests wait for a configured worker; worker health is not verified
        here.
      </p>
      <Button type="button" disabled={busy} onClick={() => void load()}>
        Load automation rules
      </Button>
      {error && <p role="alert">{error}</p>}
      {rules && rules.length === 0 && <p>No automation rules.</p>}
      {rules?.map((rule) => (
        <article key={rule.id} className="space-y-1 border-t pt-2">
          <strong>{rule.title}</strong>
          <p>
            {triggerLabels[rule.trigger]} → {actionLabels[rule.action]};{' '}
            {rule.condition === 'always' ? 'Any priority' : 'High priority'}; {rule.debounceSeconds}
            s debounce; {rule.enabled ? 'enabled' : 'disabled'}
          </p>
          {owner && (
            <Button
              type="button"
              disabled={busy}
              aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.title}`}
              onClick={() => void setEnabled(rule, !rule.enabled)}
            >
              {rule.enabled ? 'Disable' : 'Enable'}
            </Button>
          )}
          {owner && (
            <Button
              type="button"
              disabled={busy}
              aria-label={`Preview ${rule.title}`}
              onClick={() => void choose(rule)}
            >
              Preview event
            </Button>
          )}
        </article>
      ))}
      {owner && selected && (
        <div className="space-y-2 border-t pt-3">
          <p>
            {selected.trigger === 'task_review' || selected.trigger === 'blocker'
              ? `Assert an event for ${selected.title}. Submission can create approval requests for all matching rules.`
              : 'Preview recorded webhook evidence. Live GitHub access is not verified.'}
          </p>
          {selected.trigger === 'task_review' || selected.trigger === 'blocker' ? (
            <label>
              Task
              <select
                aria-label="Task"
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Select a task</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Repository
                <select
                  aria-label="Repository"
                  value={repositoryId}
                  onChange={(e) => void chooseRepository(e.target.value)}
                >
                  <option value="">Select a repository</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.owner}/{repo.name}
                    </option>
                  ))}
                </select>
              </label>
              {disconnected && <p>GitHub app disconnected.</p>}
              <label>
                Recorded event
                <select
                  aria-label="Recorded event"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Select recorded evidence</option>
                  {recorded
                    .filter((item) =>
                      selected.trigger === 'pr_merged'
                        ? item.kind === 'pull_request' && item.state === 'merged'
                        : item.kind === 'check_run' &&
                          item.state === 'completed' &&
                          item.conclusion === 'success',
                    )
                    .map((item) => (
                      <option key={`${item.kind}:${item.subject}`} value={item.subject}>
                        {item.kind === 'pull_request' ? 'PR' : 'Check'} #{item.subject} ·{' '}
                        {item.providerAt}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <Button
            type="button"
            disabled={
              busy ||
              (selected.trigger === 'task_review' || selected.trigger === 'blocker'
                ? !taskId
                : !repositoryId || !subject)
            }
            onClick={() => void checkPreview()}
          >
            Preview event
          </Button>
          {preview === true && (
            <>
              <p>Eligible — owner approval is required.</p>
              {selected.trigger === 'task_review' || selected.trigger === 'blocker' ? (
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  Submit event for approval
                </Button>
              ) : (
                <p>
                  Signed webhook events create requests automatically when the rule is enabled.
                  Preview does not create or execute work.
                </p>
              )}
            </>
          )}
          {preview === false && (
            <p>
              {previewReason === 'debounced'
                ? 'A matching event is inside the debounce window.'
                : previewReason === 'disabled'
                  ? 'This rule is disabled.'
                  : previewReason === 'verification_unavailable'
                    ? 'Verified CI evidence is unavailable; linked status will not be changed.'
                    : previewReason === 'condition_failed'
                      ? 'The task does not meet the rule condition.'
                      : 'The event does not match this rule.'}
            </p>
          )}
        </div>
      )}
      {owner && executions.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          <h3>Execution timeline</h3>
          <p>Showing up to the latest 100 executions; older entries are not displayed.</p>
          {executions.map((execution) => {
            const name = rules?.find((rule) => rule.id === execution.ruleId)?.title || 'Rule';
            const source = execution.source;
            return (
              <article key={execution.id}>
                <p>
                  {name}: {execution.status.replaceAll('_', ' ')} ·{' '}
                  {execution.origin === 'human_assertion'
                    ? 'Human assertion'
                    : 'Signed webhook record'}{' '}
                  · {execution.createdAt}
                </p>
                <p>Proposed action: {actionLabels[execution.action]}</p>
                {source.kind === 'task' ? (
                  <p>
                    Task: {source.title} · Asserted by:{' '}
                    {members.find((member) => member.user.id === source.actorId)?.user.name ||
                      'Former or unnamed member'}
                  </p>
                ) : (
                  <p>
                    Recorded source: {source.repository}{' '}
                    {execution.trigger === 'pr_merged' ? 'PR' : 'check'} #{source.subject}. Provider
                    timestamp: {source.providerAt}; observed: {source.observedAt}. Provider access
                    unverified.
                  </p>
                )}
                {execution.errorCode && (
                  <p>Execution unavailable: {execution.errorCode.replaceAll('_', ' ')}</p>
                )}
                {execution.report && (
                  <p>
                    Recorded PR merge: {execution.report.repository} #{execution.report.pullNumber}.
                    Provider timestamp: {execution.report.providerAt}; observed:{' '}
                    {execution.report.observedAt}. Live GitHub access is not verified.
                  </p>
                )}
                <ol>
                  {execution.audit.map((entry, i) => (
                    <li key={i}>
                      {entry.kind} · {entry.createdAt}
                      {entry.actorId
                        ? ` · ${members.find((member) => member.user.id === entry.actorId)?.user.name || 'Former or unnamed member'}`
                        : ' · Automation worker'}
                    </li>
                  ))}
                </ol>
                {execution.status === 'pending_approval' && execution.current && (
                  <Button
                    type="button"
                    disabled={busy}
                    aria-label={`Approve ${name} execution`}
                    onClick={() => void approve(execution.id)}
                  >
                    Approve
                  </Button>
                )}
                {!execution.current && execution.status === 'pending_approval' && (
                  <p>Rule changed; this request cannot be approved.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {owner && rules && (
        <div className="space-y-2">
          <label>
            Rule name
            <Input
              aria-label="Rule name"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Trigger
            <select
              aria-label="Trigger"
              value={trigger}
              onChange={(e) => {
                const parsed = ruleSchema.shape.trigger.safeParse(e.target.value);
                if (parsed.success) {
                  setTrigger(parsed.data);
                  setCondition('always');
                }
              }}
            >
              {Object.keys(actions).map((value) => (
                <option key={value} value={value}>
                  {triggerLabels[value as keyof typeof triggerLabels]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select
              aria-label="Condition"
              value={condition}
              onChange={(e) => {
                const parsed = ruleSchema.shape.condition.safeParse(e.target.value);
                if (parsed.success) setCondition(parsed.data);
              }}
            >
              <option value="always">Any priority</option>
              {(trigger === 'task_review' || trigger === 'blocker') && (
                <option value="high_priority">High priority</option>
              )}
            </select>
          </label>
          <label>
            Debounce window (seconds)
            <Input
              aria-label="Debounce window (seconds)"
              type="number"
              min={1}
              max={86400}
              value={debounceSeconds}
              onChange={(e) => setDebounceSeconds(Number(e.target.value))}
            />
          </label>
          <Button
            type="button"
            disabled={
              busy ||
              !title.trim() ||
              !Number.isInteger(debounceSeconds) ||
              debounceSeconds < 1 ||
              debounceSeconds > 86400
            }
            onClick={() => void create()}
          >
            Create disabled rule
          </Button>
        </div>
      )}
    </section>
  );
}
