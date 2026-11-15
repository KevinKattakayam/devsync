import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  authorizeWorkspace,
  OWNER_ROLES,
  WRITE_ROLES,
  withWorkspaceAccess,
} from '../security/workspace-policy';
import { receiptSource } from './decision-receipts';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import type { TenantTransaction } from '../lib/tenant-prisma';
import type { StoredAutomationRule } from './automation-store';

export const automationHumanEventInput = z
  .object({ trigger: z.enum(['task_review', 'blocker']), taskId: z.string().min(1).max(191) })
  .strict();
export const automationPreviewInput = z.union([
  automationHumanEventInput.extend({ ruleId: z.string().min(1).max(191) }).strict(),
  z
    .object({
      ruleId: z.string().min(1).max(191),
      trigger: z.enum(['pr_merged', 'ci_passed']),
      repositoryId: z.string().min(1).max(191),
      subject: z.string().regex(/^[1-9][0-9]{0,15}$/),
    })
    .strict(),
]);
export async function previewAutomationEvent(actorId: string, workspaceId: string, raw: unknown) {
  const input = automationPreviewInput.parse(raw);
  return withWorkspaceAccess(actorId, workspaceId, WRITE_ROLES, async (tx) => {
    const rules = await tx.$queryRaw<
      StoredAutomationRule[]
    >`SELECT * FROM "AutomationRule" WHERE id=${input.ruleId} AND "workspaceId"=${workspaceId}`;
    if (!rules.length) throw new NotFoundError('Rule unavailable');
    const membership = await authorizeWorkspace(actorId, workspaceId, WRITE_ROLES, tx);
    if (
      (rules[0].trigger === 'pr_merged' ||
        rules[0].trigger === 'ci_passed' ||
        'repositoryId' in input) &&
      membership.role !== 'OWNER'
    )
      throw new NotFoundError('Rule unavailable');
    const rule = rules[0];
    if ('repositoryId' in input) {
      const kind = input.trigger === 'pr_merged' ? 'pull_request' : 'check_run';
      const source = await loadGitHubSource(
        tx,
        workspaceId,
        input.repositoryId,
        kind,
        input.subject,
      );
      let reason = !rule.enabled
        ? 'disabled'
        : rule.trigger !== input.trigger
          ? 'wrong_trigger'
          : (kind === 'pull_request' && source.state !== 'merged') ||
              (kind === 'check_run' &&
                (source.state !== 'completed' || source.conclusion !== 'success'))
            ? 'condition_failed'
            : kind === 'check_run'
              ? 'verification_unavailable'
              : 'eligible';
      if (reason === 'eligible') {
        const recent = await tx.$queryRaw<
          { id: string }[]
        >`SELECT x.id FROM "AutomationExecution" x JOIN "AutomationEvent" e ON e.id=x."eventId" AND e."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND x."ruleId"=${rule.id} AND e."repositoryId"=${input.repositoryId} AND e."sourceId"=${input.subject} AND x."createdAt">NOW()-(${rule.debounceSeconds} * INTERVAL '1 second') LIMIT 1`;
        if (recent.length) reason = 'debounced';
      }
      return { eligible: reason === 'eligible', requiresApproval: true as const, reason };
    }
    await receiptSource(tx, workspaceId, 'task', input.taskId);
    const task = await tx.task.findFirst({
      where: { id: input.taskId, column: { board: { workspaceId } } },
      select: { priority: true },
    });
    if (!task) throw new NotFoundError('Source unavailable');
    let reason = !rule.enabled
      ? 'disabled'
      : rule.trigger !== input.trigger
        ? 'wrong_trigger'
        : rule.condition === 'high_priority' &&
            task.priority !== 'HIGH' &&
            task.priority !== 'URGENT'
          ? 'condition_failed'
          : 'eligible';
    if (reason === 'eligible') {
      const recent = await tx.$queryRaw<
        { id: string }[]
      >`SELECT x.id FROM "AutomationExecution" x JOIN "AutomationEvent" e ON e.id=x."eventId" AND e."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND x."ruleId"=${rule.id} AND e."taskId"=${input.taskId} AND x."createdAt">NOW()-(${rule.debounceSeconds} * INTERVAL '1 second') LIMIT 1`;
      if (recent.length) reason = 'debounced';
    }
    return { eligible: reason === 'eligible', requiresApproval: true as const, reason };
  });
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const idempotencyKey = z.string().regex(/^[\x21-\x7e]{1,128}$/);
export type Execution = {
  id: string;
  workspaceId: string;
  ruleId: string;
  eventId: string;
  ruleVersion: number;
  status: string;
  approvedBy: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type EventRecord = {
  id: string;
  workspaceId: string;
  trigger: string;
  origin: string;
  taskId: string | null;
  repositoryId: string | null;
  sourceId: string;
  sourceRevision: string;
  actorId: string | null;
  requestHash: string;
  createdAt: Date;
};
type GitHubSource = {
  kind: string;
  subject: string;
  state: string;
  conclusion: string | null;
  headSha: string | null;
  providerAt: Date;
  observedAt: Date;
  owner: string;
  name: string;
};
function githubRevision(row: GitHubSource) {
  return digest(
    JSON.stringify([
      row.kind,
      row.subject,
      row.state,
      row.conclusion,
      row.headSha,
      row.providerAt.toISOString(),
    ]),
  );
}
async function loadGitHubSource(
  tx: TenantTransaction,
  workspaceId: string,
  repositoryId: string | null,
  kind: string,
  subject: string,
) {
  const rows = await tx.$queryRaw<
    GitHubSource[]
  >`SELECT s.kind,s.subject,s.state,s.conclusion,s."headSha",s."providerAt",s."observedAt",r.owner,r.name FROM "GitHubExecutionState" s JOIN "GitHubRepository" r ON r.id=s."repositoryId" AND r."workspaceId"=s."workspaceId" WHERE s."workspaceId"=${workspaceId} AND s."repositoryId"=${repositoryId} AND s.kind=${kind} AND s.subject=${subject} AND r."providerDisconnectedAt" IS NULL`;
  if (!rows.length) throw new NotFoundError('Source unavailable');
  return rows[0];
}
async function githubSource(
  tx: TenantTransaction,
  workspaceId: string,
  event: Pick<EventRecord, 'trigger' | 'repositoryId' | 'sourceId' | 'sourceRevision'>,
) {
  const kind = event.trigger === 'pr_merged' ? 'pull_request' : 'check_run';
  const row = await loadGitHubSource(tx, workspaceId, event.repositoryId, kind, event.sourceId);
  if (githubRevision(row) !== event.sourceRevision) throw new ConflictError('Source changed');
  if (kind === 'pull_request' && row.state !== 'merged') throw new ConflictError('Source changed');
  if (kind === 'check_run' && (row.state !== 'completed' || row.conclusion !== 'success'))
    throw new ConflictError('Source changed');
  return row;
}
async function audit(
  tx: TenantTransaction,
  workspaceId: string,
  executionId: string,
  kind: string,
  actorId: string | null,
) {
  await tx.$executeRaw`INSERT INTO "AutomationAudit" (id,"workspaceId","executionId",kind,"actorId") VALUES (${randomUUID()},${workspaceId},${executionId},${kind},${actorId})`;
}
/** Called only inside the authenticated, replay-fenced GitHub webhook transaction. */
export async function recordAutomationGitHubEvent(
  tx: TenantTransaction,
  repository: { id: string; workspaceId: string },
  eventName: string,
  action: string | undefined,
  payload: unknown,
  bodyDigest: string,
) {
  if (process.env.FEATURE_AUTOMATION !== 'true') return;
  let trigger: 'pr_merged' | 'ci_passed',
    kind: 'pull_request' | 'check_run',
    subject: string,
    observedTime: string;
  if (eventName === 'pull_request' && action === 'closed') {
    const parsed = z
      .object({
        number: z.number().int().positive(),
        merged: z.literal(true),
        updated_at: z.iso.datetime(),
      })
      .safeParse(payload);
    if (!parsed.success) return;
    trigger = 'pr_merged';
    kind = 'pull_request';
    subject = String(parsed.data.number);
    observedTime = parsed.data.updated_at;
  } else if (eventName === 'check_run' && action === 'completed') {
    const parsed = z
      .object({
        id: z.number().int().positive(),
        status: z.literal('completed'),
        conclusion: z.literal('success'),
        completed_at: z.iso.datetime(),
      })
      .safeParse(payload);
    if (!parsed.success) return;
    trigger = 'ci_passed';
    kind = 'check_run';
    subject = String(parsed.data.id);
    observedTime = parsed.data.completed_at;
  } else return;
  const workspaceId = repository.workspaceId;
  const sourceRows = await tx.$queryRaw<
    GitHubSource[]
  >`SELECT s.kind,s.subject,s.state,s.conclusion,s."headSha",s."providerAt",s."observedAt",r.owner,r.name FROM "GitHubExecutionState" s JOIN "GitHubRepository" r ON r.id=s."repositoryId" AND r."workspaceId"=s."workspaceId" WHERE s."workspaceId"=${workspaceId} AND s."repositoryId"=${repository.id} AND s.kind=${kind} AND s.subject=${subject} AND r."providerDisconnectedAt" IS NULL`;
  const source = sourceRows[0];
  if (
    !source ||
    source.providerAt.toISOString() !== new Date(observedTime).toISOString() ||
    (kind === 'pull_request'
      ? source.state !== 'merged'
      : source.state !== 'completed' || source.conclusion !== 'success')
  )
    return;
  const rules = await tx.$queryRaw<
    StoredAutomationRule[]
  >`SELECT * FROM "AutomationRule" WHERE "workspaceId"=${workspaceId} AND enabled AND trigger=${trigger} ORDER BY id LIMIT 100`;
  if (!rules.length) return;
  const eventId = randomUUID(),
    dedupeKey = digest(JSON.stringify(['github', repository.id, bodyDigest, trigger])),
    revision = githubRevision(source);
  const inserted = await tx.$queryRaw<
    { id: string }[]
  >`INSERT INTO "AutomationEvent" (id,"workspaceId",trigger,origin,"repositoryId","sourceId","sourceRevision","dedupeKey","requestHash") VALUES (${eventId},${workspaceId},${trigger},'signed_webhook',${repository.id},${subject},${revision},${dedupeKey},${bodyDigest}) ON CONFLICT ("workspaceId","dedupeKey") DO NOTHING RETURNING id`;
  if (!inserted.length) return;
  for (const rule of rules) {
    const recent = await tx.$queryRaw<
      { id: string }[]
    >`SELECT x.id FROM "AutomationExecution" x JOIN "AutomationEvent" e ON e.id=x."eventId" AND e."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND x."ruleId"=${rule.id} AND e."repositoryId"=${repository.id} AND e."sourceId"=${subject} AND x."createdAt">NOW()-(${rule.debounceSeconds} * INTERVAL '1 second') LIMIT 1`;
    if (recent.length) continue;
    const executionId = randomUUID();
    await tx.$executeRaw`INSERT INTO "AutomationExecution" (id,"workspaceId","ruleId","eventId","ruleVersion",status) VALUES (${executionId},${workspaceId},${rule.id},${eventId},${rule.version},'pending_approval')`;
    await audit(tx, workspaceId, executionId, 'created', null);
  }
}
/** Human task events are assertions, not inferred workflow state; no source data is stored. */
export async function submitAutomationEvent(
  actorId: string,
  workspaceId: string,
  raw: unknown,
  key: string | undefined,
) {
  const input = automationHumanEventInput.parse(raw);
  const parsed = idempotencyKey.safeParse(key);
  if (!parsed.success) throw new BadRequestError('Idempotency-Key is required');
  const dedupeKey = digest(JSON.stringify([workspaceId, actorId, parsed.data]));
  const requestHash = digest(JSON.stringify(input));
  return withWorkspaceAccess(actorId, workspaceId, WRITE_ROLES, async (tx) => {
    const source = await receiptSource(tx, workspaceId, 'task', input.taskId);
    const task = await tx.task.findFirst({
      where: { id: input.taskId, column: { board: { workspaceId } } },
      select: { priority: true },
    });
    if (!task) throw new NotFoundError('Source unavailable');
    const existing = await tx.$queryRaw<
      EventRecord[]
    >`SELECT * FROM "AutomationEvent" WHERE "workspaceId"=${workspaceId} AND "dedupeKey"=${dedupeKey}`;
    if (existing.length) {
      if (existing[0].requestHash !== requestHash)
        throw new ConflictError('Idempotency-Key was used with a different request');
      const executions = await tx.$queryRaw<
        Execution[]
      >`SELECT * FROM "AutomationExecution" WHERE "workspaceId"=${workspaceId} AND "eventId"=${existing[0].id} ORDER BY id`;
      return { eventId: existing[0].id, executions };
    }
    const eventId = randomUUID();
    await tx.$executeRaw`INSERT INTO "AutomationEvent" (id,"workspaceId",trigger,origin,"taskId","sourceId","sourceRevision","actorId","dedupeKey","requestHash") VALUES (${eventId},${workspaceId},${input.trigger},'human_assertion',${input.taskId},${input.taskId},${source.revision},${actorId},${dedupeKey},${requestHash})`;
    const rules = await tx.$queryRaw<
      StoredAutomationRule[]
    >`SELECT * FROM "AutomationRule" WHERE "workspaceId"=${workspaceId} AND enabled AND trigger=${input.trigger} ORDER BY id LIMIT 100`;
    const executions: Execution[] = [];
    for (const rule of rules) {
      if (
        rule.condition === 'high_priority' &&
        task.priority !== 'HIGH' &&
        task.priority !== 'URGENT'
      )
        continue;
      const recent = await tx.$queryRaw<
        { id: string }[]
      >`SELECT x.id FROM "AutomationExecution" x JOIN "AutomationEvent" e ON e.id=x."eventId" AND e."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND x."ruleId"=${rule.id} AND e."taskId"=${input.taskId} AND x."createdAt">NOW()-(${rule.debounceSeconds} * INTERVAL '1 second') LIMIT 1`;
      if (recent.length) continue;
      const rows = await tx.$queryRaw<
        Execution[]
      >`INSERT INTO "AutomationExecution" (id,"workspaceId","ruleId","eventId","ruleVersion",status) VALUES (${randomUUID()},${workspaceId},${rule.id},${eventId},${rule.version},'pending_approval') RETURNING *`;
      executions.push(rows[0]);
      await audit(tx, workspaceId, rows[0].id, 'created', actorId);
    }
    return { eventId, executions };
  });
}
async function findExecution(tx: TenantTransaction, workspaceId: string, executionId: string) {
  const rows = await tx.$queryRaw<
    Execution[]
  >`SELECT * FROM "AutomationExecution" WHERE id=${executionId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundError('Execution unavailable');
  return rows[0];
}
async function currentSources(tx: TenantTransaction, workspaceId: string, execution: Execution) {
  const rules = await tx.$queryRaw<
    StoredAutomationRule[]
  >`SELECT * FROM "AutomationRule" WHERE id=${execution.ruleId} AND "workspaceId"=${workspaceId}`;
  const events = await tx.$queryRaw<
    EventRecord[]
  >`SELECT * FROM "AutomationEvent" WHERE id=${execution.eventId} AND "workspaceId"=${workspaceId}`;
  if (!rules.length || !events.length) throw new NotFoundError('Source unavailable');
  const rule = rules[0],
    event = events[0];
  if (!rule.enabled || rule.version !== execution.ruleVersion)
    throw new ConflictError('Rule changed or disabled');
  const expectedAction = {
    task_review: 'notify',
    blocker: 'escalate',
    pr_merged: 'prepare_report',
    ci_passed: 'update_linked_status',
  } as const;
  const trigger = z
    .enum(['task_review', 'blocker', 'pr_merged', 'ci_passed'])
    .safeParse(event.trigger);
  if (!trigger.success || expectedAction[trigger.data] !== rule.action)
    throw new ConflictError('Rule changed or disabled');
  if (rule.trigger !== event.trigger) throw new ConflictError('Rule changed or disabled');
  if (event.origin === 'signed_webhook')
    return { rule, event, github: await githubSource(tx, workspaceId, event) };
  if (!event.taskId || !event.actorId) throw new NotFoundError('Source unavailable');
  await authorizeWorkspace(event.actorId, workspaceId, WRITE_ROLES, tx);
  const source = await receiptSource(tx, workspaceId, 'task', event.taskId);
  if (source.revision !== event.sourceRevision) throw new ConflictError('Source changed');
  return { rule, event, github: null };
}
export async function approveAutomationExecution(
  actorId: string,
  workspaceId: string,
  executionId: string,
) {
  return withWorkspaceAccess(actorId, workspaceId, OWNER_ROLES, async (tx) => {
    const execution = await findExecution(tx, workspaceId, executionId);
    await currentSources(tx, workspaceId, execution);
    if (execution.status === 'approved' && execution.approvedBy === actorId) return execution;
    if (execution.status !== 'pending_approval')
      throw new ConflictError('Execution is not awaiting approval');
    const [updated] = await tx.$queryRaw<
      Execution[]
    >`UPDATE "AutomationExecution" SET status='approved',"approvedBy"=${actorId},"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
    await audit(tx, workspaceId, executionId, 'approved', actorId);
    return updated;
  });
}
type Lease = { attempts: number; token: string | null; active: boolean };
/** A durable tenant-scoped lease keeps retries bounded across process restarts. */
export async function claimAutomationExecution(workspaceId: string, executionId: string) {
  return prisma.withTenantTransaction(workspaceId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    const execution = await findExecution(tx, workspaceId, executionId);
    if (['completed', 'unavailable', 'cancelled', 'failed'].includes(execution.status)) return null;
    if (execution.status !== 'approved') throw new ConflictError('Execution requires approval');
    const rows = await tx.$queryRaw<
      Lease[]
    >`SELECT attempts,token,("leaseUntil">NOW()) AS active FROM "AutomationLease" WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    const previous = rows[0];
    if (previous?.active) return null;
    if ((previous?.attempts || 0) >= 3) {
      await tx.$executeRaw`UPDATE "AutomationExecution" SET status='failed',"errorCode"='worker_failed',"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} AND status='approved'`;
      await audit(tx, workspaceId, executionId, 'failed', null);
      return null;
    }
    const token = randomUUID();
    const [lease] = await tx.$queryRaw<
      { attempts: number }[]
    >`INSERT INTO "AutomationLease" ("executionId","workspaceId",attempts,token,"leaseUntil") VALUES (${executionId},${workspaceId},1,${token},NOW()+INTERVAL '60 seconds') ON CONFLICT ("executionId") DO UPDATE SET attempts="AutomationLease".attempts+1,token=EXCLUDED.token,"leaseUntil"=EXCLUDED."leaseUntil" RETURNING attempts`;
    await audit(tx, workspaceId, executionId, 'started', null);
    return { token, attempt: lease.attempts };
  });
}
export async function failAutomationClaim(workspaceId: string, executionId: string, token: string) {
  return prisma.withTenantTransaction(workspaceId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    const execution = await findExecution(tx, workspaceId, executionId);
    const rows = await tx.$queryRaw<
      Lease[]
    >`SELECT attempts,token,("leaseUntil">NOW()) AS active FROM "AutomationLease" WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    if (!rows.length || rows[0].token !== token || execution.status !== 'approved')
      throw new ConflictError('Execution lease unavailable');
    await tx.$executeRaw`UPDATE "AutomationLease" SET token=NULL,"leaseUntil"=NULL WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId}`;
    if (rows[0].attempts >= 3) {
      const [failed] = await tx.$queryRaw<
        Execution[]
      >`UPDATE "AutomationExecution" SET status='failed',"errorCode"='worker_failed',"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
      await audit(tx, workspaceId, executionId, 'failed', null);
      return failed;
    }
    await audit(tx, workspaceId, executionId, 'retrying', null);
    return execution;
  });
}
/** Worker-only entry point. It rechecks the original owner's current authority and source under lock. */
export async function executeAutomationExecution(
  workspaceId: string,
  executionId: string,
  leaseToken: string,
) {
  return prisma.withTenantTransaction(workspaceId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
    const execution = await findExecution(tx, workspaceId, executionId);
    if (['completed', 'unavailable', 'cancelled', 'failed'].includes(execution.status))
      return execution;
    if (execution.status !== 'approved' || !execution.approvedBy)
      throw new ConflictError('Execution requires approval');
    const lease = await tx.$queryRaw<
      { token: string }[]
    >`SELECT token FROM "AutomationLease" WHERE "workspaceId"=${workspaceId} AND "executionId"=${executionId} AND token=${leaseToken} AND "leaseUntil">NOW() FOR UPDATE`;
    if (!lease.length) throw new ConflictError('Execution lease unavailable');
    try {
      await authorizeWorkspace(execution.approvedBy, workspaceId, OWNER_ROLES, tx);
      await currentSources(tx, workspaceId, execution);
    } catch (error) {
      if (!(
        error instanceof ForbiddenError ||
        error instanceof NotFoundError ||
        error instanceof ConflictError
      ))
        throw error;
      const errorCode =
        error instanceof ForbiddenError
          ? 'approval_revoked'
          : error instanceof ConflictError && error.message === 'Rule changed or disabled'
            ? 'rule_disabled'
            : 'source_unavailable';
      const [cancelled] = await tx.$queryRaw<
        Execution[]
      >`UPDATE "AutomationExecution" SET status='cancelled',"errorCode"=${errorCode},"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
      await audit(tx, workspaceId, executionId, 'cancelled', null);
      await tx.$executeRaw`UPDATE "AutomationLease" SET token=NULL,"leaseUntil"=NULL WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} AND token=${leaseToken}`;
      return cancelled;
    }
    const { rule, event } = await currentSources(tx, workspaceId, execution);
    if (rule.action === 'notify' || rule.action === 'escalate') {
      await tx.activity.create({
        data: {
          type: rule.action === 'notify' ? 'automation_notification' : 'automation_escalation',
          message:
            rule.action === 'notify'
              ? 'An approved task-review assertion was posted to workspace activity.'
              : 'An approved blocker assertion was escalated to workspace activity.',
          userId: execution.approvedBy,
          workspaceId,
          metadata: {
            automationExecutionId: execution.id,
            taskId: event.taskId,
            origin: 'human_assertion',
            requestedBy: event.actorId,
          },
        },
      });
      const [completed] = await tx.$queryRaw<
        Execution[]
      >`UPDATE "AutomationExecution" SET status='completed',"errorCode"=NULL,"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
      await audit(tx, workspaceId, executionId, 'completed', null);
      await tx.$executeRaw`UPDATE "AutomationLease" SET token=NULL,"leaseUntil"=NULL WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} AND token=${leaseToken}`;
      return completed;
    }
    if (
      rule.action === 'prepare_report' &&
      event.origin === 'signed_webhook' &&
      event.trigger === 'pr_merged'
    ) {
      const [completed] = await tx.$queryRaw<
        Execution[]
      >`UPDATE "AutomationExecution" SET status='completed',"errorCode"=NULL,"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
      await audit(tx, workspaceId, executionId, 'completed', null);
      await tx.$executeRaw`UPDATE "AutomationLease" SET token=NULL,"leaseUntil"=NULL WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} AND token=${leaseToken}`;
      return completed;
    }
    const errorCode =
      rule.action === 'notify'
        ? 'notification_unconfigured'
        : rule.action === 'escalate'
          ? 'escalation_unconfigured'
          : rule.action === 'update_linked_status'
            ? 'ci_verification_unavailable'
            : 'provider_unavailable';
    const [updated] = await tx.$queryRaw<
      Execution[]
    >`UPDATE "AutomationExecution" SET status='unavailable',"errorCode"=${errorCode},"updatedAt"=now() WHERE id=${executionId} AND "workspaceId"=${workspaceId} RETURNING *`;
    await audit(tx, workspaceId, executionId, 'unavailable', null);
    await tx.$executeRaw`UPDATE "AutomationLease" SET token=NULL,"leaseUntil"=NULL WHERE "executionId"=${executionId} AND "workspaceId"=${workspaceId} AND token=${leaseToken}`;
    return updated;
  });
}
export async function listAutomationExecutions(actorId: string, workspaceId: string) {
  return withWorkspaceAccess(actorId, workspaceId, OWNER_ROLES, (tx) =>
    listAutomationExecutionsForOwner(tx, workspaceId),
  );
}
/** Call only inside a transaction that has already checked OWNER authority. */
export async function listAutomationExecutionsForOwner(tx: TenantTransaction, workspaceId: string) {
  const executions = await tx.$queryRaw<
    (Execution & {
      origin: string;
      trigger: string;
      taskId: string | null;
      repositoryId: string | null;
      sourceId: string;
      sourceRevision: string;
      eventActorId: string | null;
      action: string;
      current: boolean;
    })[]
  >`SELECT x.*,e.origin,e.trigger,e."taskId",e."repositoryId",e."sourceId",e."sourceRevision",e."actorId" AS "eventActorId",r.action,(r.enabled AND r.version=x."ruleVersion") AS current FROM "AutomationExecution" x JOIN "AutomationEvent" e ON e.id=x."eventId" AND e."workspaceId"=x."workspaceId" JOIN "AutomationRule" r ON r.id=x."ruleId" AND r."workspaceId"=x."workspaceId" WHERE x."workspaceId"=${workspaceId} AND ((e.origin='human_assertion' AND EXISTS (SELECT 1 FROM "Task" t JOIN "Column" c ON c.id=t."columnId" JOIN "Board" b ON b.id=c."boardId" WHERE t.id=e."taskId" AND b."workspaceId"=${workspaceId})) OR (e.origin='signed_webhook' AND EXISTS (SELECT 1 FROM "GitHubRepository" g WHERE g.id=e."repositoryId" AND g."workspaceId"=${workspaceId} AND g."providerDisconnectedAt" IS NULL))) ORDER BY x."createdAt" DESC,x.id LIMIT 100`;
  if (!executions.length) return [];
  const auditRows = await tx.$queryRaw<
    { executionId: string; kind: string; actorId: string | null; createdAt: Date }[]
  >`SELECT "executionId",kind,"actorId","createdAt" FROM "AutomationAudit" WHERE "workspaceId"=${workspaceId} AND "executionId" IN (${Prisma.join(executions.map((item) => item.id))}) ORDER BY "createdAt",id LIMIT 1000`;
  const results = [];
  for (const item of executions) {
    let report = null;
    let source:
      | { kind: 'task'; title: string; actorId: string }
      | {
          kind: 'github';
          repository: string;
          subject: string;
          providerAt: Date;
          observedAt: Date;
          liveAccess: 'not_verified';
        };
    if (item.origin === 'signed_webhook') {
      try {
        const github = await githubSource(tx, workspaceId, item);
        source = {
          kind: 'github',
          repository: `${github.owner}/${github.name}`,
          subject: github.subject,
          providerAt: github.providerAt,
          observedAt: github.observedAt,
          liveAccess: 'not_verified',
        };
        if (item.trigger === 'pr_merged' && item.status === 'completed')
          report = {
            kind: 'signed_webhook_record' as const,
            repository: `${github.owner}/${github.name}`,
            pullNumber: Number(github.subject),
            providerAt: github.providerAt,
            observedAt: github.observedAt,
            liveAccess: 'not_verified' as const,
          };
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof ConflictError) continue;
        throw error;
      }
    } else {
      if (!item.taskId || !item.eventActorId) continue;
      const task = await tx.task.findFirst({
        where: { id: item.taskId, column: { board: { workspaceId } } },
        select: { title: true },
      });
      if (!task) continue;
      source = { kind: 'task', title: task.title, actorId: item.eventActorId };
    }
    let current = item.current;
    if (current && (item.status === 'pending_approval' || item.status === 'approved')) {
      try {
        await currentSources(tx, workspaceId, item);
      } catch (error) {
        if (
          error instanceof ForbiddenError ||
          error instanceof NotFoundError ||
          error instanceof ConflictError
        )
          current = false;
        else throw error;
      }
    }
    const {
      repositoryId: _repositoryId,
      sourceId: _sourceId,
      sourceRevision: _sourceRevision,
      eventActorId: _eventActorId,
      ...safe
    } = item;
    results.push({
      ...safe,
      current,
      source,
      report,
      audit: auditRows.filter((row) => row.executionId === item.id),
    });
  }
  return results;
}
