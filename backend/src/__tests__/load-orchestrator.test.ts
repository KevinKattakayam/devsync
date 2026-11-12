import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import {
  runFixtureLoadSmoke,
  type LoadOrchestratorDependencies,
  type ProvisionedLoadFixture,
} from '../../testing/load-orchestrator';
import type { FixtureLoadConnection, SmokeResult } from '../../testing/k6-launcher';
import { FixtureSetupError } from '../../testing/load-diagnostics';
import {
  createFixtureServerEnvironment,
  validateLocalContainerRuntime,
} from '../../testing/run-load-smoke';

const connection: FixtureLoadConnection = {
  baseUrl: 'http://127.0.0.1:5501/api',
  capability: 'ab'.repeat(32),
  accessToken: 'fixture.token',
  workspaceId: 'devsync-sample',
  documentId: 'devsync-sample-doc',
};
const fixture: ProvisionedLoadFixture = {
  environment: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://browser_runtime@127.0.0.1:5432/devsync_e2e_load',
    REDIS_URL: 'redis://127.0.0.1:6379',
    E2E_RUN_SECRET: 'ab'.repeat(32),
  },
  origin: 'http://127.0.0.1:5501',
  apiBaseUrl: connection.baseUrl,
  capability: connection.capability,
  workspaceId: connection.workspaceId,
  documentId: connection.documentId,
  cleanup: jest.fn().mockResolvedValue(undefined),
};
const authentication = {
  accessToken: connection.accessToken,
  logout: jest.fn().mockResolvedValue(undefined),
};
const fixtureCleanup = jest.fn(async () => undefined);
fixture.cleanup = fixtureCleanup;
function dependencies(overrides: Partial<LoadOrchestratorDependencies> = {}) {
  const server = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    kill: jest.fn(() => true),
  }) as unknown as ChildProcess;
  const defaults: LoadOrchestratorDependencies = {
    provision: jest.fn().mockResolvedValue(fixture),
    startServer: jest.fn().mockResolvedValue(server),
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    verifyPreflight: jest.fn().mockResolvedValue(undefined),
    authenticateOwner: jest.fn().mockResolvedValue(authentication),
    launch: jest.fn().mockResolvedValue({ status: 0, error: null, metrics: null }),
    stopServer: jest.fn().mockResolvedValue(undefined),
  };
  return { ...defaults, ...overrides };
}
const success: SmokeResult = { status: 0, error: null, metrics: null };

beforeEach(() => jest.clearAllMocks());

it('accepts the postgres URI scheme produced by Testcontainers for the restricted local role', async () => {
  const postgresFixture = {
    ...fixture,
    environment: {
      ...fixture.environment,
      DATABASE_URL: 'postgres://browser_runtime@127.0.0.1:5432/devsync_e2e_load',
    },
  };
  const deps = dependencies({ provision: jest.fn().mockResolvedValue(postgresFixture) });
  expect((await runFixtureLoadSmoke(deps, undefined, { preflightOnly: true })).outcome).toBe(
    'preflight_complete',
  );
  expect(() => createFixtureServerEnvironment(postgresFixture)).not.toThrow();
  const remote = {
    ...postgresFixture,
    environment: {
      ...postgresFixture.environment,
      DATABASE_URL: 'postgres://browser_runtime@remote.example:5432/devsync_e2e_load',
    },
  };
  expect(
    (await runFixtureLoadSmoke(dependencies({ provision: jest.fn().mockResolvedValue(remote) })))
      .outcome,
  ).toBe('fixture_setup_failed');
  expect(() => createFixtureServerEnvironment(remote)).toThrow();
});

it('starts an isolated fixture, authenticates its synthetic owner, launches k6, and cleans up', async () => {
  const deps = dependencies();
  expect(await runFixtureLoadSmoke(deps)).toEqual({
    exitCode: 0,
    outcome: 'completed',
    smoke: success,
    failureStage: null,
    cleanupFailed: false,
  });
  expect(deps.provision).toHaveBeenCalledTimes(1);
  expect(deps.authenticateOwner).toHaveBeenCalledWith(fixture, undefined);
  expect(deps.launch).toHaveBeenCalledWith(
    { ...connection, capability: fixture.capability },
    undefined,
  );
  expect(authentication.logout).toHaveBeenCalledTimes(1);
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('does not continue after disposable fixture provisioning fails', async () => {
  const deps = dependencies({
    provision: jest.fn().mockRejectedValue(new Error(connection.accessToken)),
  });
  const result = await runFixtureLoadSmoke(deps);
  expect(result).toEqual({
    exitCode: 1,
    outcome: 'fixture_setup_failed',
    smoke: null,
    failureStage: 'fixture_setup',
    cleanupFailed: false,
  });
  expect(JSON.stringify(result)).not.toContain(connection.accessToken);
  expect(deps.startServer).not.toHaveBeenCalled();
  expect(deps.authenticateOwner).not.toHaveBeenCalled();
});

it('cleans disposable resources after fixture-server startup failure', async () => {
  const deps = dependencies({
    startServer: jest.fn().mockRejectedValue(new Error('private detail')),
  });
  expect(await runFixtureLoadSmoke(deps)).toMatchObject({
    exitCode: 1,
    outcome: 'server_start_failed',
    failureStage: 'fixture_server_start',
  });
  expect(deps.authenticateOwner).not.toHaveBeenCalled();
  expect(deps.stopServer).not.toHaveBeenCalled();
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('rejects remote or non-runtime fixture configuration before server startup', async () => {
  const unsafe = { ...fixture, origin: 'https://example.com' };
  const deps = dependencies({ provision: jest.fn().mockResolvedValue(unsafe) });
  expect(await runFixtureLoadSmoke(deps)).toEqual({
    exitCode: 1,
    outcome: 'fixture_setup_failed',
    smoke: null,
    failureStage: 'fixture_validation',
    cleanupFailed: false,
  });
  expect(deps.startServer).not.toHaveBeenCalled();
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('stops the server and containers after fixture authentication failure', async () => {
  const deps = dependencies({
    authenticateOwner: jest.fn().mockRejectedValue(new Error(connection.capability)),
  });
  const result = await runFixtureLoadSmoke(deps);
  expect(result).toEqual({
    exitCode: 1,
    outcome: 'authentication_failed',
    smoke: null,
    failureStage: 'owner_authentication',
    cleanupFailed: false,
  });
  expect(JSON.stringify(result)).not.toContain(connection.capability);
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('does not authenticate or launch when the live fixture preflight fails', async () => {
  const deps = dependencies({
    verifyPreflight: jest.fn().mockRejectedValue(new Error('capability redacted')),
  });
  expect(await runFixtureLoadSmoke(deps)).toEqual({
    exitCode: 1,
    outcome: 'fixture_verification_failed',
    smoke: null,
    failureStage: 'fixture_preflight',
    cleanupFailed: false,
  });
  expect(deps.authenticateOwner).not.toHaveBeenCalled();
  expect(deps.launch).not.toHaveBeenCalled();
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('cleans the session, fixture server and containers after load cancellation', async () => {
  const controller = new AbortController();
  const deps = dependencies({
    launch: jest.fn().mockImplementation(async (_input, signal) => {
      expect(signal).toBe(controller.signal);
      return { status: null, error: 'cancelled', metrics: null };
    }),
  });
  expect(await runFixtureLoadSmoke(deps, controller.signal)).toMatchObject({
    exitCode: 1,
    outcome: 'cancelled',
  });
  expect(authentication.logout).toHaveBeenCalledTimes(1);
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('attempts every cleanup action and reports cleanup failure without details', async () => {
  const deps = dependencies({
    stopServer: jest.fn().mockRejectedValue(new Error(connection.capability)),
  });
  authentication.logout.mockRejectedValueOnce(new Error(connection.accessToken));
  fixtureCleanup.mockRejectedValueOnce(new Error(connection.capability));
  const result = await runFixtureLoadSmoke(deps);
  expect(result).toEqual({
    exitCode: 1,
    outcome: 'cleanup_failed',
    smoke: success,
    failureStage: 'cleanup',
    cleanupFailed: true,
  });
  expect(JSON.stringify(result)).not.toContain(connection.capability);
  expect(JSON.stringify(result)).not.toContain(connection.accessToken);
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('reports a sanitized fixture lifecycle stage without exposing the setup exception', async () => {
  const privateDetail = 'postgresql://user:secret@host/db';
  const deps = dependencies({
    provision: jest.fn().mockRejectedValue(new FixtureSetupError('migration')),
  });
  const result = await runFixtureLoadSmoke(deps);
  expect(result).toMatchObject({
    exitCode: 1,
    outcome: 'fixture_setup_failed',
    failureStage: 'migration',
  });
  expect(JSON.stringify(result)).not.toContain(privateDetail);
  expect(JSON.stringify(result)).not.toContain(connection.capability);
  expect(deps.startServer).not.toHaveBeenCalled();
});

it.each(['postgres_start', 'redis_start', 'migration', 'seed', 'runtime_role'] as const)(
  'preserves the fixed %s setup stage and does not include private exception data',
  async (stage) => {
    const privateDetail = 'postgresql://fixture-user:private-password@localhost/db';
    const deps = dependencies({
      provision: jest.fn().mockRejectedValue(new FixtureSetupError(stage)),
    });
    const result = await runFixtureLoadSmoke(deps);
    expect(result.failureStage).toBe(stage);
    expect(result.outcome).toBe('fixture_setup_failed');
    expect(JSON.stringify(result)).not.toContain(privateDetail);
    expect(JSON.stringify(result)).not.toContain(connection.capability);
    expect(deps.startServer).not.toHaveBeenCalled();
    expect(deps.launch).not.toHaveBeenCalled();
  },
);

it('completes fixture verification without launching k6 in preflight-only mode', async () => {
  const deps = dependencies();
  expect(await runFixtureLoadSmoke(deps, undefined, { preflightOnly: true })).toEqual({
    exitCode: 0,
    outcome: 'preflight_complete',
    smoke: null,
    failureStage: null,
    cleanupFailed: false,
  });
  expect(deps.verifyPreflight).toHaveBeenCalledWith(fixture, undefined);
  expect(deps.authenticateOwner).toHaveBeenCalledWith(fixture, undefined);
  expect(deps.launch).not.toHaveBeenCalled();
  expect(authentication.logout).toHaveBeenCalledTimes(1);
  expect(deps.stopServer).toHaveBeenCalledTimes(1);
  expect(fixtureCleanup).toHaveBeenCalledTimes(1);
});

it('builds an explicit fixture-server environment without administrator or inherited secrets', () => {
  const environment = createFixtureServerEnvironment({
    ...fixture,
    environment: {
      ...fixture.environment,
      PATH: '/usr/bin',
      PORT: '5501',
      REDIS_URL: 'redis://127.0.0.1:6379',
      ENCRYPTION_KEY: 'cd'.repeat(32),
      SUPERADMIN_SERVICE_TOKEN: 'ef'.repeat(32),
      E2E_ADMIN_DATABASE_URL: 'postgresql://admin:fixture-placeholder@127.0.0.1/devsync_e2e_load',
      AWS_SECRET_ACCESS_KEY: 'must-not-reach-child',
      K6_VUS: '1000',
    },
  });
  expect(environment).toMatchObject({ NODE_ENV: 'test', PORT: '5501', PATH: '/usr/bin' });
  expect(environment).not.toHaveProperty('E2E_ADMIN_DATABASE_URL');
  expect(environment).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
  expect(environment).not.toHaveProperty('K6_VUS');
  expect(environment.DATABASE_URL).toContain('browser_runtime');
});

it('refuses remote, reusable or cleanup-disabled container runtime configuration', () => {
  expect(() =>
    validateLocalContainerRuntime({ DOCKER_HOST: 'tcp://remote.example:2376' }),
  ).toThrow();
  expect(() => validateLocalContainerRuntime({ DOCKER_CONTEXT: 'production' })).toThrow();
  expect(() =>
    validateLocalContainerRuntime({
      DOCKER_HOST: 'unix:///var/run/docker.sock',
      TESTCONTAINERS_REUSE_ENABLE: 'true',
    }),
  ).toThrow();
  expect(() =>
    validateLocalContainerRuntime({
      DOCKER_HOST: 'unix:///var/run/docker.sock',
      TESTCONTAINERS_RYUK_DISABLED: 'true',
    }),
  ).toThrow();
  expect(() =>
    validateLocalContainerRuntime({ DOCKER_HOST: 'unix:///var/run/docker.sock' }),
  ).not.toThrow();
});
