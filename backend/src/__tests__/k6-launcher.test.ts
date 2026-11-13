import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn, type ChildProcess } from 'child_process';
import { launchFixtureSmoke, type FixtureLoadConnection } from '../../testing/k6-launcher';

jest.mock('child_process', () => ({
  ...jest.requireActual<typeof import('child_process')>('child_process'),
  spawn: jest.fn(),
}));
const connection: FixtureLoadConnection = {
  baseUrl: 'http://127.0.0.1:5501/api',
  capability: 'ab'.repeat(32),
  accessToken: 'fixture.token',
  workspaceId: 'workspace',
  documentId: 'document',
};
function child() {
  const events = new EventEmitter();
  const kill = jest.fn(() => true);
  return Object.assign(events, { kill, stdout: new PassThrough() }) as unknown as ChildProcess & {
    kill: jest.Mock;
  };
}
const mockedSpawn = jest.mocked(spawn);

it('launches only the fixed smoke script with a restricted environment', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  process.env.K6_VUS = '999';
  process.env.AWS_SECRET_ACCESS_KEY = 'fixture-secret';
  try {
    const pending = launchFixtureSmoke(connection);
    while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
    processFixture.emit('close', 0, null);
    expect(await pending).toEqual({
      status: 0,
      error: null,
      metrics: null,
      summaryDiagnostic: 'summary_missing',
      summaryChunks: 'none',
    });
    const [command, args, options] = mockedSpawn.mock.calls[0];
    expect(command).toBe('k6');
    expect(args).toEqual(['run', expect.stringMatching(/load-smoke\.js$/)]);
    expect(options).toMatchObject({
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { K6_FIXTURE_CAPABILITY: connection.capability },
    });
    expect(options?.env).not.toHaveProperty('K6_VUS');
    expect(options?.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(JSON.stringify(args)).not.toContain(connection.capability);
    expect(JSON.stringify(args)).not.toContain(connection.accessToken);
    expect(Object.keys(options?.env || {}).sort()).toEqual(
      [
        'K6_ACCESS_TOKEN',
        'K6_BASE_URL',
        'K6_DOCUMENT_ID',
        'K6_FIXTURE_CAPABILITY',
        'K6_NO_USAGE_REPORT',
        'K6_WORKSPACE_ID',
        'PATH',
      ].sort(),
    );
  } finally {
    delete process.env.K6_VUS;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  }
});
it('rejects unsafe targets, malformed tokens, missing capabilities and extra options before spawning', async () => {
  for (const invalid of [
    { ...connection, baseUrl: 'http://example.com/api' },
    { ...connection, capability: '' },
    { ...connection, accessToken: 'invalid' },
    { ...connection, output: '/tmp/other' },
  ])
    expect(await launchFixtureSmoke(invalid)).toEqual({
      status: null,
      error: 'invalid_configuration',
      metrics: null,
    });
  expect(await launchFixtureSmoke(connection, {} as AbortSignal)).toEqual({
    status: null,
    error: 'invalid_configuration',
    metrics: null,
  });
  expect(mockedSpawn).not.toHaveBeenCalled();
});
it('returns a sanitized startup error after child close', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  processFixture.emit('error', new Error(connection.capability));
  processFixture.emit('close', null, null);
  expect(await pending).toEqual({ status: null, error: 'startup_failed', metrics: null });
});
it('cancellation sends SIGTERM and waits for child close', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const controller = new AbortController();
  let settled = false;
  const pending = launchFixtureSmoke(connection, controller.signal).then((result) => {
    settled = true;
    return result;
  });
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  expect(processFixture.kill).toHaveBeenCalledWith('SIGTERM');
  expect(settled).toBe(false);
  processFixture.emit('close', null, 'SIGTERM');
  expect(await pending).toEqual({ status: null, error: 'cancelled', metrics: null });
});

it('returns the actual nonzero exit status and removes the temporary directory', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  processFixture.emit('close', 17, null);
  expect(await pending).toEqual({
    status: 17,
    error: null,
    metrics: null,
    summaryDiagnostic: 'summary_missing',
    summaryChunks: 'none',
  });
});

it('handles SIGTERM and escalates to SIGKILL after the grace period', async () => {
  const prior = new Set(process.listeners('SIGTERM'));
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  const handler = process.listeners('SIGTERM').find((listener) => !prior.has(listener));
  expect(handler).toBeDefined();
  jest.useFakeTimers();
  try {
    handler?.call(process, 'SIGTERM');
    expect(processFixture.kill).toHaveBeenCalledWith('SIGTERM');
    jest.advanceTimersByTime(3000);
    expect(processFixture.kill).toHaveBeenCalledWith('SIGKILL');
    processFixture.emit('close', null, 'SIGKILL');
    expect(await pending).toEqual({ status: null, error: 'cancelled', metrics: null });
    expect(process.listeners('SIGTERM')).not.toContain(handler);
  } finally {
    jest.useRealTimers();
  }
});

it('returns only an allowlisted numeric performance summary', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  const record = JSON.stringify({
    version: 1,
    metrics: {
      http_req_duration: { values: { med: 4, 'p(95)': 8, 'p(99)': 10 } },
      http_reqs: { values: { count: 12, rate: 2 } },
      http_req_failed: { values: { rate: 0 } },
      application_latency_ms: { values: { med: 3, 'p(95)': 6, 'p(99)': 8 } },
      application_requests: { values: { count: 8, rate: 1.5 } },
      application_failures: { values: { rate: 0.125 } },
      health_latency_ms: { values: { med: 1, 'p(95)': 2, 'p(99)': 3 } },
      profile_latency_ms: { values: { med: 1, 'p(95)': 2, 'p(99)': 3 } },
      documents_latency_ms: { values: { med: 1, 'p(95)': 2, 'p(99)': 3 } },
      document_latency_ms: { values: { med: 5, 'p(95)': 7, 'p(99)': 9 } },
    },
  });
  (processFixture.stdout as PassThrough).write(
    `unrelated ${connection.accessToken}\nDEVSYNC_K6_SUMMARY_V1:${record.slice(0, 40)}`,
  );
  (processFixture.stdout as PassThrough).write(`${record.slice(40)}\nother output\n`);
  processFixture.emit('close', 0, null);
  const result = await pending;
  expect(result.summaryChunks).toBe('multiple');
  expect(result.metrics).toEqual({
    requestDurationMs: { median: 4, p95: 8, p99: 10 },
    requests: { count: 12, perSecond: 2 },
    failedRequestRate: 0,
    application: {
      requestDurationMs: { median: 3, p95: 6, p99: 8 },
      requests: { count: 8, perSecond: 1.5 },
      failedRequestRate: 0.125,
    },
    endpoints: {
      health: { median: 1, p95: 2, p99: 3 },
      profile: { median: 1, p95: 2, p99: 3 },
      documents: { median: 1, p95: 2, p99: 3 },
      document: { median: 5, p95: 7, p99: 9 },
    },
  });
  expect(JSON.stringify(result)).not.toContain(connection.capability);
  expect(JSON.stringify(result)).not.toContain(connection.accessToken);
});

it('rejects oversized summary output without returning its contents', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  (processFixture.stdout as PassThrough).write('x'.repeat(128 * 1024 + 1));
  processFixture.emit('close', 0, null);
  expect(await pending).toEqual({
    status: 0,
    error: null,
    metrics: null,
    summaryDiagnostic: 'summary_oversized',
    summaryChunks: 'single',
  });
});

it.each([
  ['ordinary console output', 'summary_missing'],
  ['DEVSYNC_K6_SUMMARY_V1:{broken', 'summary_invalid_json'],
  ['DEVSYNC_K6_SUMMARY_V1:{"version":1,"metrics":{}}', 'summary_schema_mismatch'],
  [
    'DEVSYNC_K6_SUMMARY_V1:{"version":1,"metrics":{},"secret":"private"}',
    'summary_schema_mismatch',
  ],
  ['DEVSYNC_K6_SUMMARY_V1:{}\nDEVSYNC_K6_SUMMARY_V1:{}', 'summary_duplicate'],
  ['DEVSYNC_K6_SUMMARY_V1:{}{}', 'summary_invalid_json'],
] as const)('classifies unusable stdout without revealing it', async (output, category) => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  (processFixture.stdout as PassThrough).write(output);
  processFixture.emit('close', 0, null);
  const result = await pending;
  expect(result.summaryDiagnostic).toBe(category);
  expect(result.summaryChunks).toBe('single');
  expect(result.metrics).toBeNull();
  expect(JSON.stringify(result)).not.toContain(output);
});
