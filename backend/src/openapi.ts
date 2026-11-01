import { Router } from 'express';
import { z, ZodSchema } from 'zod';
import { apiErrorSchema, requireRouteContract, routeContracts } from './contracts';
export interface ApiMount {
  prefix: string;
  router: Router;
  security?: Record<string, string[]>[];
}
interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: { requestSchema?: ZodSchema; idempotencyKeySchema?: ZodSchema } }[];
  };
}
export function generateOpenApi(mounts: ApiMount[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, Record<string, unknown>> = {};
  function relocate(value: unknown, base: string): unknown {
    if (Array.isArray(value)) return value.map((item) => relocate(item, base));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === '$ref' && typeof child === 'string' && child.startsWith('#')
            ? base + child.slice(1)
            : relocate(child, base),
        ]),
      );
    return value;
  }
  function jsonSchema(value: z.ZodType, name: string, io: 'input' | 'output' = 'output') {
    const result = relocate(
      z.toJSONSchema(value, { unrepresentable: 'any', io }),
      `#/components/schemas/${name}`,
    ) as Record<string, unknown>;
    schemas[name] = result;
    return result;
  }
  jsonSchema(apiErrorSchema, 'ApiError');
  // Operational/Next handlers retain their actual mount order and authentication.
  // These metadata-only routers are never mounted on a server; source inventory tests guard them.
  const external: ApiMount[] = [];
  for (const [key, contract] of routeContracts)
    if (contract.surface) {
      const split = key.indexOf(' '),
        method = key.slice(0, split).toLowerCase(),
        path = key.slice(split + 1);
      const router = Router();
      router.route(path)[method as 'get' | 'post']((_req, _res) => {});
      external.push({
        prefix: '',
        router,
        security:
          path === '/metrics'
            ? [{ MetricsBearer: [] }]
            : path === '/api/docs' || path === '/api/auth/reset'
              ? []
              : [{ ClerkSession: [] }, { ClerkCookie: [] }],
      });
    }
  for (const mount of [...mounts, ...external]) {
    for (const layer of mount.router.stack as unknown as Layer[]) {
      if (!layer.route || typeof layer.route.path !== 'string') continue;
      const path = `${mount.prefix}${layer.route.path === '/' ? '' : layer.route.path}`.replace(
        /:([a-zA-Z0-9_]+)/g,
        '{$1}',
      );
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled) continue;
        const contract = requireRouteContract(method, path);
        const id = `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const schema =
          layer.route.stack.find((item) => item.handle.requestSchema)?.handle.requestSchema ||
          contract.body;
        if (
          ['post', 'patch', 'put'].includes(method) &&
          !schema &&
          contract.bodyPolicy !== 'ignored'
        )
          throw new Error(`Route has no request schema: ${method.toUpperCase()} ${path}`);
        if (!Object.keys(contract.responses).length)
          throw new Error(`Route has no response schemas: ${method.toUpperCase()} ${path}`);
        const keySchema = layer.route.stack.find((item) => item.handle.idempotencyKeySchema)?.handle
          .idempotencyKeySchema;
        const parameters: Record<string, unknown>[] = [...path.matchAll(/\{([^}]+)\}/g)].map(
          (match) => ({
            name: match[1],
            in: 'path',
            required: true,
            schema: jsonSchema(
              z
                .string()
                .min(1)
                .max(match[1] === 'externalId' ? 255 : 191),
              `Path_${id}_${match[1]}`,
            ),
          }),
        );
        const query = jsonSchema(contract.query, `Query_${id}`);
        const required = z.array(z.string()).parse(query.required || []);
        for (const [name, property] of Object.entries(
          (query.properties || {}) as Record<string, unknown>,
        ))
          parameters.push({
            name,
            in: 'query',
            required: required.includes(name),
            schema: property,
          });
        for (const [name, header] of Object.entries(contract.headers || {})) {
          const parameter: Record<string, unknown> = {
            name,
            in: 'header',
            required: Boolean(header.required),
            schema: jsonSchema(
              header.schema,
              `RequestHeader_${id}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
              'input',
            ),
          };
          if (header.description) parameter.description = header.description;
          parameters.push(parameter);
        }
        const correlationHeaders =
          contract.surface === 'frontend'
            ? {}
            : {
                'X-Request-ID': {
                  description: 'Fresh server-generated request UUID.',
                  schema: jsonSchema(z.string().uuid(), `Correlation_${id}`),
                },
                trace_id: {
                  description: 'Present when a trace is available.',
                  schema: jsonSchema(z.string().regex(/^[a-fA-F0-9]{32}$/), `Trace_${id}`),
                },
              };
        if (contract.surface !== 'frontend')
          parameters.push({
            name: 'trace_id',
            in: 'header',
            required: false,
            description: 'Optional legacy trace ID; invalid values are ignored.',
            schema: jsonSchema(z.string().regex(/^[a-fA-F0-9]{32}$/), `RequestTrace_${id}`),
          });
        if (keySchema)
          parameters.push({
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: jsonSchema(keySchema, `Idempotency_${id}`, 'input'),
            description:
              'Optional atomic create receipt; same authority and logical scope, 24-hour window. Different payload with the same key returns409. Authorization is rechecked on replay.',
          });
        const responses: Record<string, unknown> = {};
        for (const [status, response] of Object.entries(contract.responses)) {
          if (!response.noContent && !response.schema)
            throw new Error(`Response has no schema: ${method} ${path} ${status}`);
          const entry: Record<string, unknown> = {
            description:
              response.description ||
              (response.noContent ? 'No response body' : 'Documented response DTO'),
          };
          if (response.schema && !response.noContent)
            entry.content = {
              [response.mime || 'application/json']: {
                schema: jsonSchema(response.schema, `Response_${id}_${status}`),
              },
            };
          entry.headers = {
            ...correlationHeaders,
            ...Object.fromEntries(
              Object.entries(response.headers || {}).map(([name, value]) => [
                name,
                { schema: jsonSchema(value, `Header_${id}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`) },
              ]),
            ),
          };
          responses[status] = entry;
        }
        responses.default = {
          description: 'Error envelope; frontend handlers can also return a plain error field.',
          headers: correlationHeaders,
          content: {
            'application/json': {
              schema:
                contract.surface === 'frontend'
                  ? jsonSchema(
                      z.union([apiErrorSchema, z.object({ error: z.string() }).strict()]),
                      `Error_${id}`,
                    )
                  : { $ref: '#/components/schemas/ApiError' },
            },
          },
        };
        const operation: Record<string, unknown> = {
          operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          security: mount.security ?? [{ ClerkSession: [] }, { ClerkCookie: [] }],
          parameters,
          // Complete documentation does not claim universal runtime response validation.
          'x-validation-complete': false,
          'x-contract-complete': true,
          responses,
        };
        if (schema)
          operation.requestBody = {
            required: true,
            content: {
              [contract.bodyMime || 'application/json']: {
                schema: jsonSchema(schema, `Request_${id}`, 'input'),
              },
            },
          };
        if (contract.description) operation.description = contract.description;
        if (contract.events)
          operation['x-sse-data-schema'] = jsonSchema(contract.events, `Events_${id}`);
        if (contract.surface === 'frontend')
          operation.servers = [
            {
              url: 'http://localhost:3000',
              description: 'Frontend origin; configure for deployment.',
            },
          ];
        if (path.startsWith('/api/v1'))
          operation['x-legacy-alias'] = path.replace('/api/v1', '/api');
        paths[path] ??= {};
        paths[path][method] = operation;
      }
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'DevSync API',
      version: '1.0.0',
      description:
        'Generated from mounted routes, registered request validators and explicit Zod transport DTO contracts. Legacy /api aliases remain supported. Runtime authentication, native signature/multipart handling and response behavior are unchanged.',
    },
    paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
    components: {
      securitySchemes: {
        ClerkSession: { type: 'http', scheme: 'bearer', bearerFormat: 'Clerk JWT' },
        ClerkCookie: { type: 'apiKey', in: 'cookie', name: '__session' },
        ScimToken: { type: 'http', scheme: 'bearer' },
        SuperadminService: { type: 'apiKey', in: 'header', name: 'x-superadmin-service-token' },
        GithubSignature: { type: 'apiKey', in: 'header', name: 'x-hub-signature-256' },
        StripeSignature: { type: 'apiKey', in: 'header', name: 'stripe-signature' },
        MetricsBearer: { type: 'http', scheme: 'bearer' },
      },
      schemas,
    },
  };
}
