import { knowledgeQuery, knowledgeSourceQuery, knowledgePage } from './services/knowledge-search';
import { createAutomationRuleInput } from './services/automation-store';
import { automationEnabledInput } from './routes/automation.routes';
import { automationHumanEventInput, automationPreviewInput } from './services/automation-execution';
import { installationInput } from './routes/github-installation.routes';
import { githubExecutionSchema } from './services/github-execution';
import { exportRequestInput, transferInput, revokeSessionInput } from './routes/lifecycle.routes';
import { aiCompleteSchema } from './services/ai-schema';
import { groundedInput, groundedOutput } from './services/grounded-ai';
import { aiUsageV3Query } from './services/ai-schema';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { inboxDeliveryPreferenceSchema } from './services/inbox-preferences';
import {
  receiptContentSchema,
  receiptEditSchema,
  receiptRevisionSchema,
  supersedeSchema,
  sourceKindSchema,
} from './services/decision-receipts';
import {
  timelineInput,
  decisionSourcesQuery,
  decisionSourceQuery,
} from './routes/decision-receipts.routes';
import {
  safetyInputSchema,
  safetySaveSchema,
  safetyFindingsQuery,
} from './routes/snippet-safety.routes';
import {
  digestPreferenceSchema,
  digestItemSchema,
  digestPreferenceWrite,
  digestAckSchema,
  digestQuerySchema,
  digestPageSchema,
} from './services/async-digest';
import { findingTypes } from './security/snippet-preflight';
import { workspaceSearchSchema } from './schemas/search.schema';

/** Transport DTOs: scalar columns follow Prisma; selected relations remain explicit. */
function model(name: string) {
  const definition = Prisma.dmmf.datamodel.models.find((item) => item.name === name);
  if (!definition) throw new Error(`Unknown contract model ${name}`);
  const shape: Record<string, z.ZodType> = {};
  for (const field of definition.fields) {
    if (field.kind === 'object' || field.kind === 'unsupported') continue;
    let schema: z.ZodType;
    if (field.kind === 'enum') {
      const values = Prisma.dmmf.datamodel.enums
        .find((item) => item.name === field.type)
        ?.values.map((item) => item.name);
      if (!values?.length) throw new Error(`Unknown contract enum ${field.type}`);
      schema = z.enum(values);
    } else {
      const scalars: Record<string, z.ZodType> = {
        String: z.string(),
        Boolean: z.boolean(),
        Int: z.number().int(),
        Float: z.number(),
        DateTime: z.iso.datetime(),
        Json: z.json(),
        BigInt: z.string().regex(/^-?\d+$/),
        Decimal: z.string().regex(/^-?\d+(\.\d+)?$/),
        Bytes: z
          .object({ type: z.literal('Buffer'), data: z.array(z.number().int().min(0).max(255)) })
          .strict(),
      };
      const scalar = scalars[field.type];
      if (!scalar) throw new Error(`Unsupported contract scalar ${field.type}`);
      schema = scalar;
    }
    if (field.isList) schema = z.array(schema);
    if (!field.isRequired) schema = schema.nullable();
    shape[field.name] = schema;
  }
  return z.object(shape).strict();
}
function select(name: string, fields: string[]) {
  const shape = model(name).shape;
  return z
    .object(
      Object.fromEntries(
        fields.map((field) => {
          if (!shape[field]) throw new Error(`Unknown contract field ${name}.${field}`);
          return [field, shape[field]];
        }),
      ),
    )
    .strict();
}
const author = select('User', ['id', 'name', 'avatar']);
const contact = select('User', ['id', 'name', 'email', 'avatar']);
const member = model('WorkspaceMember');
const memberContact = member.extend({ user: contact });
const activity = model('Activity').extend({ user: author });
const workspace = model('Workspace');
const document = model('Document');
const documentMini = select('Document', ['id', 'title', 'icon']);
const documentWrite = document.extend({ author });
const documentRead = documentWrite.extend({ children: z.array(documentMini) });
const documentList = z.array(documentWrite.extend({ children: z.array(documentRead) }));
const snippet = model('Snippet').extend({ author });
const task = model('Task').extend({
  assignee: author.nullable(),
  labels: z.array(model('TaskLabel')),
});
const column = model('Column');
const board = model('Board');
const repository = select('GitHubRepository', [
  'id',
  'repositoryId',
  'owner',
  'name',
  'installationId',
  'prOpenedColumnId',
  'prMergedColumnId',
  'createdAt',
]);
const count2 = z.object({ documents: z.number().int(), boards: z.number().int() }).strict();
const count3 = count2.extend({ snippets: z.number().int() });
export const apiErrorSchema = z
  .object({ error: z.string(), code: z.string(), requestId: z.string().uuid() })
  .passthrough();
const plainError = z.object({ error: z.string() }).strict();
const message = (value: string) => z.object({ message: z.literal(value) }).strict();
const empty = z.object({}).strict();
const source = z.object({ type: z.string(), title: z.string(), score: z.number() }).strict();
export const aiEventSchema = z.union([
  z.object({ sources: z.array(source) }).strict(),
  z.object({ content: z.string() }).strict(),
  z.object({ done: z.literal(true) }).strict(),
  apiErrorSchema,
]);
const keywordBase = z.object({ id: z.string(), title: z.string(), updatedAt: z.iso.datetime() });
const search = z.discriminatedUnion('mode', [
  z
    .object({ mode: z.literal('semantic'), results: z.array(source.extend({ body: z.string() })) })
    .strict(),
  z
    .object({
      mode: z.literal('keyword'),
      results: z.array(
        z.discriminatedUnion('type', [
          keywordBase.extend({ type: z.literal('document') }).strict(),
          keywordBase
            .extend({ type: z.literal('snippet'), description: z.string().nullable() })
            .strict(),
          keywordBase.extend({ type: z.literal('task'), taskKey: z.string().nullable() }).strict(),
        ]),
      ),
    })
    .strict(),
]);
const scim = z
  .object({
    schemas: z.array(z.literal('urn:ietf:params:scim:schemas:core:2.0:User')),
    id: z.string(),
    externalId: z.string(),
    userName: z.string(),
    active: z.boolean(),
    name: z.object({ formatted: z.string().optional() }).strict(),
    meta: z.object({ resourceType: z.literal('User') }).strict(),
  })
  .strict();
export interface ResponseContract {
  schema?: z.ZodType;
  mime?: string;
  noContent?: boolean;
  description?: string;
  headers?: Record<string, z.ZodType>;
}
export interface RouteContract {
  responses: Record<string, ResponseContract>;
  query: z.ZodObject;
  body?: z.ZodType;
  bodyMime?: string;
  events?: z.ZodType;
  surface?: 'app' | 'frontend';
  description?: string;
  bodyPolicy?: 'ignored';
  headers?: Record<string, { schema: z.ZodType; required?: boolean; description?: string }>;
}
const contracts = new Map<string, RouteContract>();
function add(
  method: string,
  path: string,
  schema: z.ZodType,
  status = '200',
  options: Partial<RouteContract> = {},
) {
  const key = `${method} ${path}`;
  if (contracts.has(key)) throw new Error(`Duplicate contract ${key}`);
  contracts.set(key, { query: empty, responses: { [status]: { schema } }, ...options });
}
function noContent(method: string, path: string) {
  contracts.set(`${method} ${path}`, { query: empty, responses: { '204': { noContent: true } } });
}
const base = '/api/v1';
add(
  'GET',
  `${base}/health`,
  z.object({ status: z.literal('ok'), timestamp: z.iso.datetime() }).strict(),
);
const ready = z
  .object({
    status: z.enum(['ready', 'unavailable']),
    configured: z.boolean(),
    database: z.enum(['ok', 'unreachable']),
    redis: z.enum(['ok', 'unreachable']),
  })
  .strict();
add('GET', `${base}/ready`, ready, '200', {
  responses: {
    '200': { schema: ready },
    '503': {
      schema: z.union([
        ready,
        apiErrorSchema,
        z
          .object({
            status: z.literal('unavailable'),
            error: z.string(),
            code: z.string().optional(),
            requestId: z.string().optional(),
          })
          .strict(),
      ]),
    },
  },
});
add('POST', `${base}/auth/sync`, model('User'), '200', {
  bodyPolicy: 'ignored',
  description: 'Synchronizes the verified identity profile. Any request body is ignored.',
});
add('PATCH', `${base}/auth/me`, contact);
add(
  'GET',
  `${base}/auth/me`,
  select('User', ['id', 'clerkId', 'name', 'email', 'avatar', 'createdAt']).extend({
    memberships: z.array(
      member.extend({ workspace: select('Workspace', ['id', 'name', 'slug', 'icon']) }),
    ),
  }),
);
add('POST', `${base}/workspaces`, workspace.extend({ members: z.array(memberContact) }), '201');
add(
  'GET',
  `${base}/workspaces`,
  z.array(
    workspace.extend({
      role: z.enum(['OWNER', 'EDITOR', 'VIEWER']),
      members: z.array(member.extend({ user: author })),
      _count: count2,
    }),
  ),
);
add(
  'GET',
  `${base}/workspaces/{id}`,
  workspace.extend({
    members: z.array(memberContact),
    _count: count3,
    activities: z.array(activity),
  }),
);
add('PATCH', `${base}/workspaces/{id}`, workspace);
add('DELETE', `${base}/workspaces/{id}`, message('Workspace deleted'));
add('GET', `${base}/workspaces/{id}/activities`, z.array(activity));
add('GET', `${base}/workspaces/{id}/search`, search, '200', { query: workspaceSearchSchema });
add('POST', `${base}/workspaces/{id}/invite`, memberContact, '201');
add('PATCH', `${base}/workspaces/{id}/members/{memberId}`, memberContact);
add('DELETE', `${base}/workspaces/{id}/members/{memberId}`, message('Member removed'));
add('POST', `${base}/workspaces/{id}/invitations`, model('WorkspaceInvitation'), '201');
add('POST', `${base}/workspaces/invitations/{invitationId}/accept`, member);
noContent('DELETE', `${base}/workspaces/{id}/invitations/{invitationId}`);
add('GET', `${base}/workspaces/{id}/documents`, documentList);
add('POST', `${base}/workspaces/{id}/documents`, documentWrite, '201');
add('POST', `${base}/workspaces/{id}/documents/import-markdown`, documentWrite, '201');
add('GET', `${base}/documents/{id}`, documentRead);
add('PATCH', `${base}/documents/{id}`, documentWrite);
add('PUT', `${base}/documents/{id}/content`, documentWrite);
add('DELETE', `${base}/documents/{id}`, message('Document archived'));
add(
  'POST',
  `${base}/workspaces/{id}/documents/ingest`,
  z
    .object({
      message: z.literal('Document ingested successfully'),
      documentId: z.string(),
      title: z.string(),
      extractedTextLength: z.number().int(),
      sourceType: z.enum(['pdf', 'image']),
    })
    .strict(),
  '201',
  {
    body: z
      .object({
        file: z.string().meta({
          format: 'binary',
          description: 'One uploaded file, maximum25MiB; MIME allowlist is enforced by Multer.',
        }),
      })
      .strict(),
    bodyMime: 'multipart/form-data',
  },
);
add(
  'GET',
  `${base}/workspaces/{id}/boards`,
  z.array(board.extend({ columns: z.array(column.extend({ tasks: z.array(task) })) })),
);
add('POST', `${base}/workspaces/{id}/boards`, board.extend({ columns: z.array(column) }), '201');
add('POST', `${base}/tasks/boards/{boardId}/columns`, column, '201');
add('PATCH', `${base}/tasks/columns/{columnId}`, column);
add('DELETE', `${base}/tasks/columns/{columnId}`, message('Column deleted'));
add('POST', `${base}/tasks/columns/{columnId}/tasks`, task, '201');
add('PATCH', `${base}/tasks/tasks/{taskId}`, task);
add(
  'PATCH',
  `${base}/tasks/tasks/{taskId}/move`,
  task.extend({
    column: z
      .object({ name: z.string(), board: z.object({ workspaceId: z.string() }).strict() })
      .strict(),
  }),
);
add('DELETE', `${base}/tasks/tasks/{taskId}`, message('Task deleted'));
add('GET', `${base}/workspaces/{id}/snippets`, z.array(snippet));
add('POST', `${base}/workspaces/{id}/snippets`, snippet, '201');
add('PATCH', `${base}/snippets/{snippetId}`, snippet);
add('DELETE', `${base}/snippets/{snippetId}`, message('Snippet deleted'));
add('POST', `${base}/snippets/execute`, apiErrorSchema, '503', {
  bodyPolicy: 'ignored',
  description: 'Execution remains disabled. The request body is ignored; no code is executed.',
});
add('GET', `${base}/workspaces/{id}/github-repositories`, z.array(repository));
const repositoryWrite = model('GitHubRepository').omit({
  webhookSecret: true,
  providerDisconnectedAt: true,
});
add('POST', `${base}/workspaces/{id}/github-repositories`, repositoryWrite, '201');
add('PATCH', `${base}/workspaces/{id}/github-repositories/{repositoryId}`, repositoryWrite);
noContent('DELETE', `${base}/workspaces/{id}/github-repositories/{repositoryId}`);
add(
  'POST',
  `${base}/webhooks/github`,
  z.union([
    z.object({ processed: z.string() }).strict(),
    z.object({ moved: z.number().int(), taskKeys: z.array(z.string().nullable()) }).strict(),
  ]),
  '200',
  {
    headers: {
      'x-github-delivery': { schema: z.string().min(1).max(191), required: true },
      'x-github-event': {
        schema: z.string().max(100),
        description: 'Defaults to unknown when omitted.',
      },
    },
    responses: {
      '200': {
        schema: z.union([
          z.object({ processed: z.string() }).strict(),
          z.object({ moved: z.number().int(), taskKeys: z.array(z.string().nullable()) }).strict(),
        ]),
      },
      '202': { schema: z.object({ ignored: z.string() }).strict() },
    },
  },
);
add('POST', `${base}/webhooks/stripe`, z.object({ received: z.literal(true) }).strict(), '200', {
  body: z
    .object({
      id: z.string(),
      type: z.string(),
      data: z.object({ object: z.record(z.string(), z.json()) }).passthrough(),
    })
    .passthrough(),
  description:
    'Stripe event JSON; signature verification uses the original raw bytes. Native provider verification is retained; the documentation schema does not transform the signed body.',
});
add('POST', `${base}/ai/complete`, z.string(), '200', {
  responses: {
    '200': {
      schema: z.string(),
      mime: 'text/event-stream',
      description: 'SSE data lines contain the documented JSON event union.',
    },
  },
  events: aiEventSchema,
});
add(
  'GET',
  `${base}/superadmin/metrics`,
  z
    .object({
      activeWorkspaces: z.number().int(),
      mrrCents: z.number(),
      aiTokens: z.number().int(),
      queueDepth: z.number().int(),
      generatedAt: z.iso.datetime(),
    })
    .strict(),
);
const killResponse = z
  .object({ workspaceId: z.string(), suspendedAt: z.iso.datetime(), reason: z.string() })
  .strict();
add('POST', `${base}/superadmin/workspaces/{workspaceId}/kill-switch`, killResponse);
add('POST', '/scim/v2/Users', scim, '201');
add('PATCH', '/scim/v2/Users/{externalId}', scim);
noContent('DELETE', '/scim/v2/Users/{externalId}');

const digestBase = '/api/v2/workspaces/{workspaceId}/digest';
add('GET', `${digestBase}/notification-preferences`, inboxDeliveryPreferenceSchema);
add('PUT', `${digestBase}/notification-preferences`, inboxDeliveryPreferenceSchema, '200', {
  body: inboxDeliveryPreferenceSchema,
});
add('GET', `${digestBase}/preferences`, digestPreferenceSchema);
add('GET', `${digestBase}/events/{activityId}`, digestItemSchema);
add('PUT', `${digestBase}/preferences`, digestPreferenceSchema, '200', {
  body: digestPreferenceWrite,
});
add('GET', `${digestBase}/items`, digestPageSchema, '200', { query: digestQuerySchema });
add(
  'GET',
  `${digestBase}/inbox/batch-preview`,
  z
    .object({
      delivery: z.literal('not_scheduled'),
      batches: z.array(
        z
          .object({ activityIds: z.array(z.string()).max(25), eligibleAt: z.iso.datetime() })
          .strict(),
      ),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  '200',
  { query: digestQuerySchema },
);
add(
  'GET',
  `${digestBase}/inbox`,
  digestPageSchema.extend({
    items: z.array(
      digestItemSchema.extend({
        eventType: z.enum(['doc_created', 'snippet_created', 'task_created', 'task_assigned']),
        category: z.enum(['activity', 'assigned_task']),
        read: z.boolean(),
      }),
    ),
  }),
  '200',
  { query: digestQuerySchema },
);
add(
  'GET',
  `${digestBase}/inbox/automation-failures`,
  z
    .object({
      items: z.array(
        z
          .object({
            executionId: z.string(),
            category: z.literal('failed_automation'),
            recordedAt: z.iso.datetime(),
            sourceKind: z.enum(['task', 'github']),
            read: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
);
add(
  'PUT',
  `${digestBase}/inbox/automation-failures/{executionId}/read`,
  z.object({ read: z.boolean() }).strict(),
  '200',
  { body: z.object({ read: z.boolean() }).strict() },
);
add(
  'PUT',
  `${digestBase}/inbox/{activityId}/read`,
  z.object({ read: z.boolean() }).strict(),
  '200',
  { body: z.object({ read: z.boolean() }).strict() },
);
add('POST', `${digestBase}/acknowledge`, digestPreferenceSchema, '200', { body: digestAckSchema });

const safetyBase = '/api/v2/workspaces/{workspaceId}/snippet-safety';
const safetyFinding = z.object({ type: z.enum(findingTypes), maskedPreview: z.string() }).strict();
add(
  'POST',
  `${safetyBase}/preflight`,
  z.object({ content: safetyInputSchema, findings: z.array(safetyFinding) }).strict(),
  '200',
  { body: safetyInputSchema },
);
add('GET', `${safetyBase}/findings`, z.array(safetyFinding), '200', { query: safetyFindingsQuery });
add(
  'POST',
  `${safetyBase}/save`,
  z.object({ snippet, findings: z.array(safetyFinding) }).strict(),
  '201',
  {
    body: safetySaveSchema,
    responses: {
      '200': { schema: z.object({ snippet, findings: z.array(safetyFinding) }).strict() },
      '201': { schema: z.object({ snippet, findings: z.array(safetyFinding) }).strict() },
    },
  },
);

const decisionsBase = '/api/v2/workspaces/{workspaceId}/decisions';
const automationBase = '/api/v2/workspaces/{workspaceId}/automation';
const automationRuleDto = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    createdBy: z.string(),
    title: z.string(),
    trigger: z.enum(['task_review', 'blocker', 'pr_merged', 'ci_passed']),
    action: z.enum(['notify', 'escalate', 'prepare_report', 'update_linked_status']),
    condition: z.enum(['always', 'high_priority']),
    debounceSeconds: z.number().int(),
    enabled: z.boolean(),
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
add('GET', automationBase, z.array(automationRuleDto));
add('POST', automationBase, automationRuleDto, '201', {
  body: createAutomationRuleInput,
});
add('PATCH', `${automationBase}/{ruleId}/enabled`, automationRuleDto, '200', {
  body: automationEnabledInput,
});
const automationExecutionDto = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    ruleId: z.string(),
    eventId: z.string(),
    ruleVersion: z.number().int(),
    status: z.enum([
      'pending_approval',
      'approved',
      'completed',
      'unavailable',
      'cancelled',
      'failed',
    ]),
    approvedBy: z.string().nullable(),
    errorCode: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
add(
  'POST',
  `${automationBase}/preview`,
  z
    .object({
      eligible: z.boolean(),
      requiresApproval: z.literal(true),
      reason: z.enum([
        'eligible',
        'disabled',
        'wrong_trigger',
        'condition_failed',
        'debounced',
        'verification_unavailable',
      ]),
    })
    .strict(),
  '200',
  { body: automationPreviewInput },
);
add(
  'POST',
  `${automationBase}/events`,
  z.object({ eventId: z.string(), executions: z.array(automationExecutionDto) }).strict(),
  '201',
  {
    body: automationHumanEventInput,
    headers: { 'Idempotency-Key': { schema: z.string().min(1).max(128), required: true } },
  },
);
add(
  'GET',
  `${automationBase}/executions`,
  z.array(
    automationExecutionDto.extend({
      origin: z.enum(['human_assertion', 'signed_webhook']),
      trigger: z.enum(['task_review', 'blocker', 'pr_merged', 'ci_passed']),
      taskId: z.string().nullable(),
      current: z.boolean(),
      action: z.enum(['notify', 'escalate', 'prepare_report', 'update_linked_status']),
      source: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('task'), title: z.string(), actorId: z.string() }).strict(),
        z
          .object({
            kind: z.literal('github'),
            repository: z.string(),
            subject: z.string(),
            providerAt: z.iso.datetime(),
            observedAt: z.iso.datetime(),
            liveAccess: z.literal('not_verified'),
          })
          .strict(),
      ]),
      report: z
        .object({
          kind: z.literal('signed_webhook_record'),
          repository: z.string(),
          pullNumber: z.number().int(),
          providerAt: z.iso.datetime(),
          observedAt: z.iso.datetime(),
          liveAccess: z.literal('not_verified'),
        })
        .strict()
        .nullable(),
      audit: z.array(
        z
          .object({
            executionId: z.string(),
            kind: z.string(),
            actorId: z.string().nullable(),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      ),
    }),
  ),
);
add('POST', `${automationBase}/executions/{executionId}/approve`, automationExecutionDto, '200', {
  body: z.object({}).strict(),
});
const receiptDto = model('DecisionReceipt');
add(
  'GET',
  decisionsBase,
  z.array(receiptDto.extend({ sourceTitle: z.string(), sourceChanged: z.boolean() })),
);
add(
  'GET',
  `${decisionsBase}/sources`,
  z.array(z.object({ id: z.string(), title: z.string(), kind: sourceKindSchema }).strict()),
  '200',
  { query: decisionSourcesQuery },
);
add(
  'GET',
  `${decisionsBase}/source`,
  z
    .object({
      id: z.string(),
      title: z.string(),
      kind: sourceKindSchema,
      revision: z.string(),
      text: z.string(),
    })
    .strict(),
  '200',
  { query: decisionSourceQuery },
);
const timelineEvidence = z
  .object({
    kind: z.string(),
    subject: z.string(),
    state: z.string(),
    conclusion: z.string().nullable(),
    providerAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    headSha: z.string().nullable(),
  })
  .strict();
const timelineEvent = z
  .object({
    id: z.string(),
    kind: z.string(),
    evidence: z.string(),
    occurredAt: z.iso.datetime(),
    recordedAt: z.iso.datetime(),
    createdBy: z.string(),
    taskId: z.string().nullable(),
    repositoryId: z.string().nullable(),
    pullNumber: z.number().int().nullable(),
    taskTitle: z.string().nullable(),
    taskUpdatedAt: z.iso.datetime().nullable(),
    repositoryOwner: z.string().nullable(),
    repositoryName: z.string().nullable(),
    pullState: z.string().nullable(),
    pullProviderAt: z.iso.datetime().nullable(),
    pullObservedAt: z.iso.datetime().nullable(),
    githubEvidence: z.array(timelineEvidence),
  })
  .strict();
add('GET', `${decisionsBase}/{receiptId}/timeline`, z.array(timelineEvent));
add('POST', `${decisionsBase}/{receiptId}/timeline`, z.object({ id: z.string() }).strict(), '201', {
  body: timelineInput,
});
add('POST', decisionsBase, receiptDto, '201', { body: receiptContentSchema });
add('PATCH', `${decisionsBase}/{receiptId}`, receiptDto, '200', { body: receiptEditSchema });
noContent('DELETE', `${decisionsBase}/{receiptId}`);
contracts.get(`DELETE ${decisionsBase}/{receiptId}`)!.body = receiptRevisionSchema;
add('POST', `${decisionsBase}/{receiptId}/accept`, receiptDto, '200', {
  body: receiptRevisionSchema,
});
add('POST', `${decisionsBase}/{receiptId}/supersede`, receiptDto, '200', { body: supersedeSchema });

const aiAllowance = z
  .object({
    daily: z.number().int().nonnegative(),
    monthly: z.number().int().nonnegative(),
    dailyLimit: z.number().int().positive(),
    monthlyLimit: z.number().int().positive(),
  })
  .strict();
const aiLimitDetail = z
  .object({
    type: z.enum(['AI_QUOTA_EXCEEDED', 'AI_CONCURRENCY_EXCEEDED']),
    scope: z.enum(['user', 'workspace']),
    period: z.enum(['daily', 'monthly', 'concurrent']),
    resetAt: z.iso.datetime(),
  })
  .strict();
add(
  'GET',
  '/api/v3/ai/usage',
  z
    .object({
      unit: z.literal('charged reservations'),
      period: z.literal('UTC calendar day/month'),
      userScope: z.literal('global account'),
      settlement: z.literal(
        'Pre-provider and explicit pre-admission failures are refunded; ambiguous or partial attempts remain charged.',
      ),
      resets: z.object({ daily: z.iso.datetime(), monthly: z.iso.datetime() }).strict(),
      concurrency: z
        .object({
          userLimit: z.number().int().positive(),
          workspaceLimit: z.number().int().positive(),
        })
        .strict(),
      user: aiAllowance,
      workspace: aiAllowance,
    })
    .strict(),
  '200',
  { query: aiUsageV3Query },
);
add(
  'POST',
  '/api/v3/ai/grounded',
  groundedOutput.extend({
    status: z.enum(['preview', 'insufficient_evidence']),
    sources: z.array(
      z.object({ reference: z.number().int(), ...knowledgePage.shape.results.element.shape }),
    ),
    notice: z.string(),
    provider: z.enum(['groq', 'openai']).optional(),
    latencyMs: z.number().optional(),
    cost: z.literal('unavailable').optional(),
  }),
  '200',
  { body: groundedInput },
);
add('POST', '/api/v3/ai/complete', aiEventSchema, '200', {
  body: aiCompleteSchema,
  events: aiEventSchema,
  responses: {
    '200': { schema: aiEventSchema, mime: 'text/event-stream' },
    '429': { schema: apiErrorSchema.extend({ limit: aiLimitDetail }) },
  },
});
add(
  'GET',
  '/api/v2/ai/usage',
  z
    .object({
      unit: z.literal('admitted requests'),
      period: z.literal('UTC calendar day/month'),
      user: aiAllowance,
      workspace: aiAllowance,
    })
    .strict(),
  '200',
  {
    surface: 'app',
    query: z.object({ workspaceId: z.string().min(1).max(191) }).strict(),
    description:
      'Current actor global and selected authorized workspace request allowances. UTC calendar periods; no prompt content or other workspace identifiers.',
  },
);

add('GET', '/healthz', z.object({ status: z.literal('ok') }).strict(), '200', {
  surface: 'frontend',
});
add('GET', '/metrics', z.string(), '200', {
  surface: 'app',
  responses: { '200': { schema: z.string(), mime: 'text/plain' } },
});
add(
  'GET',
  '/api/docs',
  z
    .object({
      openapi: z.literal('3.1.0'),
      info: z.object({ title: z.string(), version: z.string(), description: z.string() }).strict(),
      paths: z.record(z.string(), z.json()),
      components: z.record(z.string(), z.json()),
    })
    .strict(),
  '200',
  { surface: 'app' },
);
add('GET', '/api/auth/reset', z.never(), '307', {
  surface: 'frontend',
  query: z.object({ redirect: z.string().optional() }).strict(),
  responses: {
    '307': {
      noContent: true,
      headers: { Location: z.string() },
    },
  },
  description:
    'Safe legacy redirect only; GET never clears cookies. Use same-origin POST for stale identity cookie reset.',
});
add('POST', '/api/auth/reset', z.never(), '303', {
  surface: 'frontend',
  bodyPolicy: 'ignored',
  query: z.object({ redirect: z.string().optional() }).strict(),
  responses: {
    '303': {
      noContent: true,
      headers: { Location: z.string(), 'Set-Cookie': z.array(z.string()) },
    },
    '403': { schema: plainError },
  },
  description:
    'Requires exact same-origin Origin. Clears only Clerk identity cookies; redirects to a safe local destination. Does not revoke provider sessions.',
});
add('POST', '/api/superadmin/workspaces/{workspaceId}/kill-switch', killResponse, '200', {
  surface: 'frontend',
  body: z.object({ reason: z.string().min(3).max(500) }),
  responses: {
    '200': { schema: killResponse },
    '400': { schema: z.union([plainError, apiErrorSchema]) },
    '403': { schema: z.union([plainError, apiErrorSchema]) },
  },
});

const exportRequestResponse = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    requestedBy: z.string(),
    status: z.literal('REVIEW_REQUIRED'),
    createdAt: z.iso.datetime(),
  })
  .strict();
add(
  'GET',
  '/api/v2/account/deletion-plan',
  z
    .object({
      deletionAvailable: z.literal(false),
      providerManaged: z.literal(true),
      ownedWorkspaces: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            activeOwners: z.number().int(),
            requiresTransfer: z.boolean(),
          })
          .strict(),
      ),
      steps: z.array(z.string()),
    })
    .strict(),
);
add(
  'GET',
  '/api/v2/account/sessions',
  z
    .object({
      items: z.array(
        z
          .object({
            id: z.string(),
            current: z.boolean(),
            createdAt: z.number(),
            lastActiveAt: z.number(),
          })
          .strict(),
      ),
      hasMore: z.boolean(),
    })
    .strict(),
);
add('POST', '/api/v2/account/sessions/{sessionId}/revoke', z.never(), '204', {
  body: revokeSessionInput,
  responses: { '204': { noContent: true } },
});
add(
  'GET',
  '/api/v2/workspaces/{workspaceId}/lifecycle',
  z
    .object({
      workspaceName: z.string(),
      retainedCrdtBackups: z.number().int(),
      requests: z.array(exportRequestResponse),
      deletionRequiresReview: z.literal(true),
    })
    .strict(),
);
add(
  'POST',
  '/api/v2/workspaces/{workspaceId}/lifecycle/export-requests',
  exportRequestResponse,
  '201',
  { body: exportRequestInput },
);
add(
  'POST',
  '/api/v2/workspaces/{workspaceId}/lifecycle/transfer',
  z.object({ newOwnerUserId: z.string(), previousOwnerRole: z.literal('EDITOR') }).strict(),
  '200',
  { body: transferInput },
);
export const routeContracts: ReadonlyMap<string, RouteContract> = contracts;
export function requireRouteContract(method: string, path: string) {
  const contract = routeContracts.get(`${method.toUpperCase()} ${path}`);
  if (!contract) throw new Error(`Route has no Zod contract: ${method.toUpperCase()} ${path}`);
  return contract;
}

add(
  'GET',
  '/api/v2/workspaces/{workspaceId}/github-repositories/{repositoryId}/execution',
  z
    .object({
      items: z.array(
        githubExecutionSchema.extend({
          providerAt: z.iso.datetime(),
          observedAt: z.iso.datetime(),
        }),
      ),
      liveAccess: z.enum(['not_verified', 'disconnected']),
      deployment: z.literal('unknown'),
    })
    .strict(),
);

add(
  'POST',
  '/api/v2/webhooks/github-installation',
  z.object({ processed: z.string().optional(), ignored: z.string().optional() }),
  '200',
  { body: installationInput },
);

add('GET', '/api/v2/workspaces/{workspaceId}/search', knowledgePage, '200', {
  query: knowledgeQuery,
});
add('GET', '/api/v2/workspaces/{workspaceId}/search/source', knowledgePage, '200', {
  query: knowledgeSourceQuery,
});
