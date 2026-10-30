import express from 'express';
import request from 'supertest';
import { Writable } from 'stream';
import app from '../app';
import { requestContext, createRequestLogging } from '../middleware/request-context.middleware';
import { errorEnvelope, errorMiddleware } from '../middleware/error.middleware';
import { drainResources } from '../lib/lifecycle';
import { readFileSync } from 'fs';
import { apiDocument } from '../app';
import { createLogger } from '../observability/logger';
import { observeAi } from '../observability/ai';
import { aiCalls, aiErrors } from '../observability/metrics';

it.each(['/api', '/api/v1'])('serves liveness and retains authentication at %s', async (prefix) => {
  const response = await request(app).get(`${prefix}/health`);
  expect(response.status).toBe(200);
  expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  const denied = await request(app).get(`${prefix}/workspaces`);
  expect(denied.status).toBe(401);
  expect(denied.body.code).toBe('UNAUTHENTICATED');
  expect(denied.body.requestId).toBe(denied.headers['x-request-id']);
});
it('includes correlation on 404s and parser failures without echoing payloads', async () => {
  const missing = await request(app).get('/not-a-route?secret=DO_NOT_LOG');
  expect(missing.body).toEqual({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    requestId: missing.headers['x-request-id'],
  });
  const malformed = await request(app)
    .post('/api/v1/auth/sync')
    .set('Content-Type', 'application/json')
    .send('{ "password": "DO_NOT_LOG"');
  expect(malformed.status).toBe(400);
  expect(malformed.body.requestId).toBe(malformed.headers['x-request-id']);
  expect(JSON.stringify(malformed.body)).not.toContain('DO_NOT_LOG');
});
it('omits request secrets, document text, URLs and raw exception text from structured logs', async () => {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const isolated = express();
  isolated.use(requestContext, errorEnvelope, createRequestLogging(destination), express.json());
  const scopedLogger = createLogger(destination);
  isolated.post('/document-secret-path', async (_req, _res, next) => {
    await Promise.resolve();
    scopedLogger.info('Asynchronous operation');
    next(new Error('DO_NOT_LOG exception'));
  });
  isolated.use(errorMiddleware);
  const response = await request(isolated)
    .post('/document-secret-path?token=DO_NOT_LOG')
    .set('Cookie', 'secret=DO_NOT_LOG')
    .set('Authorization', 'Bearer DO_NOT_LOG')
    .send({ password: 'DO_NOT_LOG', content: 'DO_NOT_LOG' });
  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toContain('DO_NOT_LOG');
  expect(lines.join('')).not.toContain('DO_NOT_LOG');
  expect(lines.join('')).not.toContain('document-secret-path');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines)
    expect(JSON.parse(line).requestId).toBe(response.headers['x-request-id']);
});
it('protects metrics even when the endpoint is unconfigured', async () => {
  const previous = process.env.METRICS_BEARER_TOKEN;
  try {
    delete process.env.METRICS_BEARER_TOKEN;
    expect((await request(app).get('/metrics')).status).toBe(404);
    process.env.METRICS_BEARER_TOKEN = 'fixture-only-metrics-secret-0123456789';
    expect((await request(app).get('/metrics')).status).toBe(403);
    expect((await request(app).get('/metrics').set('Authorization', 'Bearer wrong')).status).toBe(
      403,
    );
    const response = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_BEARER_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.text).toContain('devsync_http_requests_total');
  } finally {
    if (previous === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = previous;
  }
});
it('serves the generated versioned route and Zod contract without snapshot drift', async () => {
  expect(JSON.parse(readFileSync('openapi.json', 'utf8'))).toEqual(apiDocument);
  const response = await request(app).get('/api/docs');
  expect(response.status).toBe(200);
  expect(response.body.openapi).toBe('3.1.0');
  expect(
    response.body.paths['/api/v1/auth/me'].patch.requestBody.content['application/json'].schema
      .properties.name.maxLength,
  ).toBe(50);
  expect(response.body.paths['/api/v1/documents/{id}'].patch).toBeDefined();
  expect(response.body.paths['/api/v1/auth/me'].patch['x-validation-complete']).toBe(false);
});
it('attempts every resource cleanup in order even if collaboration flush fails', async () => {
  const order: string[] = [];
  const close = (name: string) => async () => {
    order.push(name);
  };
  await expect(
    drainResources({
      stopAccepting: close('http'),
      collaboration: async () => {
        order.push('collaboration');
        throw new Error('DB failure');
      },
      sockets: close('sockets'),
      redis: close('redis'),
      database: close('database'),
      telemetry: close('telemetry'),
      force: () => {
        order.push('forced');
      },
    }),
  ).rejects.toThrow('failed to drain');
  expect(order).toEqual(['http', 'collaboration', 'sockets', 'redis', 'database', 'telemetry']);
});
it('enforces a shutdown deadline without leaving its timer running', async () => {
  const force = jest.fn();
  const close = async () => {};
  await expect(
    drainResources(
      {
        stopAccepting: close,
        collaboration: () => new Promise<void>(() => {}),
        sockets: close,
        redis: close,
        database: close,
        telemetry: close,
        force,
      },
      30,
    ),
  ).rejects.toThrow('deadline');
  expect(force).toHaveBeenCalledTimes(1);
});
it('counts successful and failed AI operations without recording input data', async () => {
  const before =
    (await aiCalls.get()).values.find((value) => value.labels.provider === 'groq')?.value ?? 0;
  expect(await observeAi('groq', async () => 'result')).toBe('result');
  await expect(
    observeAi('groq', async () => {
      throw new Error('private provider data');
    }),
  ).rejects.toThrow('private provider data');
  expect(
    (await aiCalls.get()).values.find((value) => value.labels.provider === 'groq')?.value,
  ).toBe(before + 2);
  expect(
    (await aiErrors.get()).values.find((value) => value.labels.provider === 'groq')?.value,
  ).toBeGreaterThan(0);
});
