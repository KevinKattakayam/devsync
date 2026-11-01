import { Prisma } from '@prisma/client';
import { z } from 'zod';
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
const repositoryWrite = model('GitHubRepository').omit({ webhookSecret: true });
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

const aiAllowance = z
  .object({
    daily: z.number().int().nonnegative(),
    monthly: z.number().int().nonnegative(),
    dailyLimit: z.number().int().positive(),
    monthlyLimit: z.number().int().positive(),
  })
  .strict();
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
      headers: { Location: z.string(), 'Set-Cookie': z.array(z.string()) },
    },
  },
  description:
    'Frontend cookie reset. Existing arbitrary redirect behavior is documented, not changed by this contract group.',
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
export const routeContracts: ReadonlyMap<string, RouteContract> = contracts;
export function requireRouteContract(method: string, path: string) {
  const contract = routeContracts.get(`${method.toUpperCase()} ${path}`);
  if (!contract) throw new Error(`Route has no Zod contract: ${method.toUpperCase()} ${path}`);
  return contract;
}
