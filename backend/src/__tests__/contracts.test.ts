import { Router } from 'express';
import { readFileSync, readdirSync } from 'fs';
import { resolve, relative } from 'path';
import ts from 'typescript';
import { apiDocument } from '../app';
import { generateOpenApi } from '../openapi';
import { routeContracts, requireRouteContract, aiEventSchema } from '../contracts';

it('fails immediately when an actual mounted route has no schema', () => {
  const router = Router();
  router.get('/unregistered', (_req, res) => {
    res.json({ ok: true });
  });
  expect(() => generateOpenApi([{ prefix: '/api/v1', router }])).toThrow(
    'Route has no Zod contract: GET /api/v1/unregistered',
  );
});
it('rejects a mutating route whose declared response lacks a registered request schema', () => {
  const router = Router();
  router.post('/workspaces', (_req, res) => {
    res.json({});
  });
  expect(() => generateOpenApi([{ prefix: '/api/v1', router }])).toThrow(
    'Route has no request schema: POST /api/v1/workspaces',
  );
});
it('covers every mounted operation and has no orphaned contracts', () => {
  const operations = Object.entries(apiDocument.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
  );
  expect(new Set(operations)).toEqual(new Set(routeContracts.keys()));
  for (const key of operations) {
    const split = key.indexOf(' '),
      contract = requireRouteContract(key.slice(0, split), key.slice(split + 1));
    expect(contract.query).toBeDefined();
    for (const response of Object.values(contract.responses))
      expect(Boolean(response.schema || response.noContent)).toBe(true);
  }
});
it('guards app-level and frontend route inventories independently of the documentation list', () => {
  const appSource = ts.createSourceFile(
    'app.ts',
    readFileSync(resolve('src/app.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const appRoutes: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(appSource) === 'app' &&
      ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text)
    ) {
      const path = node.arguments[0];
      if (!path || !ts.isStringLiteral(path))
        throw new Error('App route requires an explicit contract inventory');
      appRoutes.push(`${node.expression.name.text.toUpperCase()} ${path.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(appSource);
  expect(new Set(appRoutes)).toEqual(
    new Set([...routeContracts].filter(([, value]) => value.surface === 'app').map(([key]) => key)),
  );
  const directory = resolve('../frontend/src/app');
  const frontendRoutes: string[] = [];
  function walk(folder: string) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'route.ts') {
        const source = ts.createSourceFile(
          path,
          readFileSync(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        const route =
          '/' +
          relative(directory, folder)
            .split('\\')
            .join('/')
            .replace(/\[([^\]]+)\]/g, '{$1}');
        for (const statement of source.statements) {
          if (
            ts.isFunctionDeclaration(statement) &&
            statement.name &&
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
          )
            frontendRoutes.push(`${statement.name.text} ${route}`);
          if (
            ts.isVariableStatement(statement) &&
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
          ) {
            for (const declaration of statement.declarationList.declarations)
              if (
                ts.isIdentifier(declaration.name) &&
                /^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)$/.test(declaration.name.text)
              )
                frontendRoutes.push(`${declaration.name.text} ${route}`);
          }
        }
      }
    }
  }
  walk(directory);
  expect(new Set(frontendRoutes)).toEqual(
    new Set(
      [...routeContracts].filter(([, value]) => value.surface === 'frontend').map(([key]) => key),
    ),
  );
});
it('resolves every recursive schema reference inside the generated OpenAPI document', () => {
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string' && child.startsWith('#')) {
        expect(child).not.toBe('#');
        let target: unknown = apiDocument;
        for (const token of child
          .slice(2)
          .split('/')
          .map((item) => item.replace(/~1/g, '/').replace(/~0/g, '~'))) {
          if (!target || typeof target !== 'object' || !(token in target))
            throw new Error(`Unresolved contract reference ${child}`);
          target = Reflect.get(target, token);
        }
        expect(target).toBeDefined();
      }
      visit(child);
    }
  }
  visit(apiDocument);
});
it('models numeric search coercion, SSE events, multipart uploads and bodyless responses', () => {
  const search = requireRouteContract('GET', '/api/v1/workspaces/{id}/search');
  expect(search.query.parse({ q: ' hello ', limit: '4' })).toEqual({ q: 'hello', limit: 4 });
  expect(search.query.safeParse({ q: 'x', limit: '99' }).success).toBe(false);
  expect(
    aiEventSchema.safeParse({ sources: [{ type: 'document', title: 'Example', score: 0.5 }] })
      .success,
  ).toBe(true);
  expect(aiEventSchema.safeParse({ done: true, content: 'unexpected mixed event' }).success).toBe(
    false,
  );
  expect(requireRouteContract('POST', '/api/v1/workspaces/{id}/documents/ingest').bodyMime).toBe(
    'multipart/form-data',
  );
  expect(
    requireRouteContract('DELETE', '/api/v1/workspaces/{id}/invitations/{invitationId}').responses[
      '204'
    ],
  ).toEqual({ noContent: true });
  expect(
    requireRouteContract('GET', '/api/auth/reset').responses['307'].headers?.Location,
  ).toBeDefined();
});
