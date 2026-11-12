import { EventEmitter } from 'events';
import { existsSync } from 'fs';
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
  return Object.assign(events, { kill }) as unknown as ChildProcess & { kill: jest.Mock };
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
    expect(await pending).toEqual({ status: 0, error: null });
    const [command, args, options] = mockedSpawn.mock.calls[0];
    expect(command).toBe('k6');
    expect(args).toEqual(['run', expect.stringMatching(/load-smoke\.js$/)]);
    expect(options).toMatchObject({
      shell: false,
      stdio: 'ignore',
      env: { K6_FIXTURE_CAPABILITY: connection.capability },
    });
    expect(options?.env).not.toHaveProperty('K6_VUS');
    expect(options?.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(JSON.stringify(args)).not.toContain(connection.capability);
    expect(existsSync(String(options?.cwd))).toBe(false);
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
    });
  expect(await launchFixtureSmoke(connection, {} as AbortSignal)).toEqual({
    status: null,
    error: 'invalid_configuration',
  });
  expect(mockedSpawn).not.toHaveBeenCalled();
});
it('returns a sanitized startup error after child close', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  const options = mockedSpawn.mock.calls[0][2];
  processFixture.emit('error', new Error(connection.capability));
  processFixture.emit('close', null, null);
  expect(await pending).toEqual({ status: null, error: 'startup_failed' });
  expect(existsSync(String(options?.cwd))).toBe(false);
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
  expect(await pending).toEqual({ status: null, error: 'cancelled' });
});

it('returns the actual nonzero exit status and removes the temporary directory', async () => {
  const processFixture = child();
  mockedSpawn.mockReturnValue(processFixture);
  const pending = launchFixtureSmoke(connection);
  while (!mockedSpawn.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
  const options = mockedSpawn.mock.calls[0][2];
  processFixture.emit('close', 17, null);
  expect(await pending).toEqual({ status: 17, error: null });
  expect(existsSync(String(options?.cwd))).toBe(false);
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
    expect(await pending).toEqual({ status: null, error: 'cancelled' });
    expect(process.listeners('SIGTERM')).not.toContain(handler);
  } finally {
    jest.useRealTimers();
  }
});
