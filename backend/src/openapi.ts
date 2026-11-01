import { Router } from 'express';
import { z, ZodSchema } from 'zod';
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
  for (const mount of mounts) {
    for (const layer of mount.router.stack as unknown as Layer[]) {
      if (!layer.route || typeof layer.route.path !== 'string') continue;
      const path = `${mount.prefix}${layer.route.path === '/' ? '' : layer.route.path}`.replace(
        /:([a-zA-Z0-9_]+)/g,
        '{$1}',
      );
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled) continue;
        const schema = layer.route.stack.find((item) => item.handle.requestSchema)?.handle
          .requestSchema;
        const keySchema = layer.route.stack.find((item) => item.handle.idempotencyKeySchema)?.handle
          .idempotencyKeySchema;
        const parameters: Record<string, unknown>[] = [...path.matchAll(/\{([^}]+)\}/g)].map(
          (match) => ({ name: match[1], in: 'path', required: true, schema: { type: 'string' } }),
        );
        if (keySchema)
          parameters.push({
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: z.toJSONSchema(keySchema),
            description:
              'Optional atomic create receipt; same authority and logical scope, 24-hour window. Different payload with the same key returns409. Authorization is rechecked on replay.',
          });
        const operation: Record<string, unknown> = {
          operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          security: mount.security ?? [{ ClerkSession: [] }, { ClerkCookie: [] }],
          parameters,
          // Missing query/response schemas are explicit rather than invented.
          'x-validation-complete': false,
          responses: {
            '2XX': { description: 'Success; response schema has not yet been registered' },
            default: {
              description: 'Error; legacy error string plus code and requestId',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
              },
            },
          },
        };
        if (schema)
          operation.requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }),
              },
            },
          };
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
        'Generated from mounted Express routes and registered Zod body validators. Query/response contracts remain partial. Legacy /api aliases are supported; see docs/API_OPERATIONS.md.',
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
      },
      schemas: {
        ApiError: {
          type: 'object',
          required: ['error', 'code', 'requestId'],
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            requestId: { type: 'string', format: 'uuid' },
          },
          additionalProperties: true,
        },
      },
    },
  };
}
