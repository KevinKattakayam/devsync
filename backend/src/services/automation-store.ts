import { randomUUID } from 'crypto';
import { z } from 'zod';
import { automationRule } from './automation-policy';
import { withWorkspaceAccess, OWNER_ROLES, READ_ROLES } from '../security/workspace-policy';
import { ConflictError, NotFoundError } from '../utils/errors';
import { idempotentCreate } from '../lib/create-idempotency';

/** No rule is enabled by creation; mutation authority is always rechecked. */
export const createAutomationRuleInput = automationRule
  .omit({ enabled: true })
  .extend({
    title: z.string().trim().min(1).max(200),
    condition: z.enum(['always', 'high_priority']),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = {
      task_review: 'notify',
      blocker: 'escalate',
      pr_merged: 'prepare_report',
      ci_passed: 'update_linked_status',
    } as const;
    if (value.action !== expected[value.trigger])
      ctx.addIssue({ code: 'custom', message: 'Unsupported trigger and action combination' });
    if (
      value.condition === 'high_priority' &&
      value.trigger !== 'task_review' &&
      value.trigger !== 'blocker'
    )
      ctx.addIssue({ code: 'custom', message: 'Priority condition requires a task trigger' });
  });
export type StoredAutomationRule = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  trigger: string;
  action: string;
  condition: string;
  debounceSeconds: number;
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function createAutomationRule(
  actorId: string,
  workspaceId: string,
  raw: unknown,
  key?: string,
) {
  const input = createAutomationRuleInput.parse(raw);
  return withWorkspaceAccess(actorId, workspaceId, OWNER_ROLES, async (tx) => {
    const result = await idempotentCreate(
      tx,
      actorId,
      ['automation.rule', workspaceId],
      key,
      input,
      async () => {
        const [count] = await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::integer AS count FROM "AutomationRule" WHERE "workspaceId"=${workspaceId}`;
        if (count.count >= 100) throw new ConflictError('Rule limit reached');
        const rows = await tx.$queryRaw<
          StoredAutomationRule[]
        >`INSERT INTO "AutomationRule" (id,"workspaceId","createdBy",title,trigger,action,condition,"debounceSeconds") VALUES (${randomUUID()},${workspaceId},${actorId},${input.title},${input.trigger},${input.action},${input.condition},${input.debounceSeconds}) RETURNING *`;
        return rows[0];
      },
    );
    return z
      .object({
        id: z.string(),
        workspaceId: z.string(),
        createdBy: z.string(),
        title: z.string(),
        trigger: z.string(),
        action: z.string(),
        condition: z.string(),
        debounceSeconds: z.number().int(),
        enabled: z.boolean(),
        version: z.number().int(),
        createdAt: z.coerce.date(),
        updatedAt: z.coerce.date(),
      })
      .strict()
      .parse(result);
  });
}
export async function listAutomationRules(actorId: string, workspaceId: string) {
  return withWorkspaceAccess(actorId, workspaceId, READ_ROLES, async (tx) => {
    const member = await tx.workspaceMember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: actorId, workspaceId } },
    });
    return tx.$queryRaw<
      StoredAutomationRule[]
    >`SELECT * FROM "AutomationRule" WHERE "workspaceId"=${workspaceId} AND (${member.role === 'OWNER'} OR trigger IN ('task_review','blocker')) ORDER BY "createdAt",id LIMIT 100`;
  });
}
export async function setAutomationEnabled(
  actorId: string,
  workspaceId: string,
  ruleId: string,
  enabled: boolean,
  expectedVersion?: number,
) {
  return withWorkspaceAccess(actorId, workspaceId, OWNER_ROLES, async (tx) => {
    const existing = await tx.$queryRaw<
      StoredAutomationRule[]
    >`SELECT * FROM "AutomationRule" WHERE id=${ruleId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    if (!existing.length) throw new NotFoundError('Rule unavailable');
    const current = existing[0];
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      if (current.enabled === enabled && current.version === expectedVersion + 1) return current;
      throw new ConflictError('Rule changed; reload before updating');
    }
    if (current.enabled === enabled) return current;
    if (current.version >= 2147483647) throw new ConflictError('Rule version limit reached');
    const rows = await tx.$queryRaw<
      StoredAutomationRule[]
    >`UPDATE "AutomationRule" SET enabled=${enabled},version=version+1,"updatedAt"=now() WHERE id=${ruleId} AND "workspaceId"=${workspaceId} RETURNING *`;
    return rows[0];
  });
}
