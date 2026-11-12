import { randomUUID } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import { access, mkdir, writeFile } from 'fs/promises';
import { constants } from 'fs';
import { delimiter, resolve } from 'path';
import { provisionDisposableFixture } from './fixture-lifecycle';
import {
  runFixtureLoadSmoke,
  type LoadFixtureAuthentication,
  type LoadOrchestratorDependencies,
  type ProvisionedLoadFixture,
} from './load-orchestrator';
import { launchFixtureSmoke } from './k6-launcher';

const root = resolve(__dirname, '../..');
const backend = resolve(root, 'backend');
const workspaceId = 'devsync-sample';
const documentId = 'devsync-sample-doc';
const ownerEmail = 'sample-owner@devsync.invalid';
const resultsDirectory = resolve(root, 'docs/quality/phase16-load-restore/results');

function isSafeLocalOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

export function validateLocalContainerRuntime(environment: NodeJS.ProcessEnv): void {
  const host = environment.DOCKER_HOST;
  if (environment.DOCKER_CONTEXT)
    throw new Error('Explicit remote or context-based container configuration is not accepted');
  if (host && !host.startsWith('unix:///'))
    throw new Error('Load smoke requires a local Unix-socket container runtime');
  if (environment.TESTCONTAINERS_HOST_OVERRIDE)
    throw new Error('Container host overrides are not accepted for load smoke');
  if (
    environment.TESTCONTAINERS_RYUK_DISABLED === 'true' ||
    environment.TESTCONTAINERS_REUSE_ENABLE === 'true'
  )
    throw new Error('Container reuse and disabled cleanup are not accepted for load smoke');
}

async function hasK6Executable(pathValue: string): Promise<boolean> {
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    try {
      await access(resolve(directory, 'k6'), constants.X_OK);
      return true;
    } catch {
      // Search the controlled PATH without invoking the k6 runtime.
    }
  }
  return false;
}

async function allocateLoopbackPort(): Promise<number> {
  const { createServer } = await import('net');
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to allocate a loopback fixture port');
  }
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

function safeBaseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
  };
}

async function fetchJson(url: string, init: RequestInit, signal?: AbortSignal) {
  const response = await fetch(url, {
    ...init,
    redirect: 'error',
    signal: signal ?? AbortSignal.timeout(5000),
  });
  return response;
}

async function verifyFixturePreflight(fixture: ProvisionedLoadFixture, signal?: AbortSignal) {
  if (
    !isSafeLocalOrigin(fixture.origin) ||
    fixture.apiBaseUrl !== `${fixture.origin}/api` ||
    fixture.workspaceId !== workspaceId ||
    fixture.documentId !== documentId ||
    !/^[a-f0-9]{64}$/.test(fixture.capability)
  )
    throw new Error('Unsafe fixture configuration');
  const response = await fetchJson(
    `${fixture.origin}/__fixture/load-preflight`,
    { headers: { 'x-e2e-run-secret': fixture.capability } },
    signal,
  );
  if (response.status !== 200) throw new Error('Fixture preflight denied');
  const proof: unknown = await response.json();
  if (
    !proof ||
    typeof proof !== 'object' ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join(',') !== 'marker,runId' ||
    (proof as { marker?: unknown }).marker !== 'devsync-isolated-fixture-v1' ||
    typeof (proof as { runId?: unknown }).runId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      (proof as { runId: string }).runId,
    )
  )
    throw new Error('Fixture preflight identity mismatch');
}

async function authenticateSyntheticOwner(
  fixture: ProvisionedLoadFixture,
  signal?: AbortSignal,
): Promise<LoadFixtureAuthentication> {
  if (!isSafeLocalOrigin(fixture.origin)) throw new Error('Unsafe fixture origin');
  let cookie: string | undefined;
  try {
    const login = await fetchJson(
      `${fixture.origin}/__test/login`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-e2e-run-secret': fixture.capability,
        },
        body: JSON.stringify({ email: ownerEmail }),
      },
      signal,
    );
    if (!login.ok) throw new Error('Fixture login denied');
    const setCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('devsync_fixture_session='));
    cookie = setCookie?.split(';', 1)[0];
    const identity: unknown = await login.json();
    if (
      !identity ||
      typeof identity !== 'object' ||
      (identity as { email?: unknown }).email !== ownerEmail ||
      typeof (identity as { id?: unknown }).id !== 'string'
    )
      throw new Error('Unexpected synthetic fixture identity');
    if (!cookie) throw new Error('Fixture session was not issued');

    const tokenResponse = await fetchJson(
      `${fixture.origin}/__test/token`,
      { headers: { cookie } },
      signal,
    );
    if (!tokenResponse.ok) throw new Error('Fixture token request denied');
    const tokenBody: unknown = await tokenResponse.json();
    const token =
      tokenBody && typeof tokenBody === 'object'
        ? (tokenBody as { token?: unknown }).token
        : undefined;
    if (
      typeof token !== 'string' ||
      token.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw new Error('Fixture token response invalid');

    const profile = await fetchJson(
      `${fixture.apiBaseUrl}/auth/me`,
      { headers: { authorization: `Bearer ${token}` } },
      signal,
    );
    if (!profile.ok) throw new Error('Synthetic identity verification failed');
    const profileBody: unknown = await profile.json();
    if (
      !profileBody ||
      typeof profileBody !== 'object' ||
      (profileBody as { email?: unknown }).email !== ownerEmail ||
      (profileBody as { clerkId?: unknown }).clerkId !== 'user_fixture_owner' ||
      !Array.isArray((profileBody as { memberships?: unknown }).memberships) ||
      !(profileBody as { memberships: { workspace?: { id?: unknown } }[] }).memberships.some(
        (membership) => membership.workspace?.id === fixture.workspaceId,
      )
    )
      throw new Error('Synthetic workspace identity verification failed');

    const sessionCookie = cookie;
    if (!sessionCookie) throw new Error('Fixture session was not issued');
    let loggedOut = false;
    return {
      accessToken: token,
      async logout() {
        if (loggedOut) return;
        loggedOut = true;
        const logout = await fetchJson(`${fixture.origin}/__test/logout`, {
          method: 'POST',
          headers: { cookie: sessionCookie },
        });
        if (logout.status !== 204) throw new Error('Fixture logout failed');
      },
    };
  } catch {
    const sessionCookie = cookie;
    if (sessionCookie) {
      try {
        await fetchJson(`${fixture.origin}/__test/logout`, {
          method: 'POST',
          headers: { cookie: sessionCookie },
        });
      } catch {
        // The fixture server and disposable database are still cleaned up by the orchestrator.
      }
    }
    throw new Error('Fixture authentication failed');
  }
}

export function createFixtureServerEnvironment(fixture: ProvisionedLoadFixture): NodeJS.ProcessEnv {
  if (!isSafeLocalOrigin(fixture.origin) || fixture.apiBaseUrl !== `${fixture.origin}/api`)
    throw new Error('Unsafe fixture server address');
  const database = new URL(fixture.environment.DATABASE_URL || '');
  const redis = new URL(fixture.environment.REDIS_URL || '');
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.username !== 'browser_runtime' ||
    !/^\/devsync_e2e_[a-z0-9_]+$/.test(database.pathname) ||
    !['localhost', '127.0.0.1', '::1'].includes(database.hostname) ||
    redis.protocol !== 'redis:' ||
    !['localhost', '127.0.0.1', '::1'].includes(redis.hostname) ||
    !/^[a-f0-9]{64}$/.test(fixture.capability)
  )
    throw new Error('Fixture runtime does not meet the disposable local boundary');
  return {
    NODE_ENV: 'test',
    PATH: fixture.environment.PATH || '/usr/local/bin:/usr/bin:/bin',
    DATABASE_URL: fixture.environment.DATABASE_URL,
    REDIS_URL: fixture.environment.REDIS_URL,
    PORT: new URL(fixture.origin).port,
    E2E_RUN_SECRET: fixture.capability,
    ENCRYPTION_KEY: fixture.environment.ENCRYPTION_KEY,
    SUPERADMIN_SERVICE_TOKEN: fixture.environment.SUPERADMIN_SERVICE_TOKEN,
    AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:3001',
    FRONTEND_URL: 'http://127.0.0.1:3001',
    CLERK_SECRET_KEY: '',
    CLERK_PUBLISHABLE_KEY: '',
    GITHUB_APP_ID: '',
    GITHUB_APP_WEBHOOK_SECRET: '',
    GITHUB_APP_PRIVATE_KEY: '',
    GROQ_API_KEY: '',
    OPENAI_API_KEY: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
  };
}

function waitForServer(server: ChildProcess, origin: string, signal?: AbortSignal): Promise<void> {
  if (!isSafeLocalOrigin(origin)) return Promise.reject(new Error('Unsafe fixture origin'));
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      server.removeListener('exit', exited);
      server.removeListener('error', exited);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolvePromise();
    };
    const exited = () => finish(new Error('Fixture server exited before readiness'));
    const aborted = () => finish(new Error('Fixture startup cancelled'));
    const started = Date.now();
    const poll = setInterval(() => {
      if (server.exitCode !== null || server.signalCode !== null) {
        finish(new Error('Fixture server exited before readiness'));
        return;
      }
      if (Date.now() - started > 60000) {
        finish(new Error('Fixture server readiness timed out'));
        return;
      }
      void fetch(`${origin}/api/health`, {
        redirect: 'error',
        signal: AbortSignal.timeout(1500),
      })
        .then((response) => {
          if (response.ok) finish();
        })
        .catch(() => undefined);
    }, 200);
    const deadline = setTimeout(
      () => finish(new Error('Fixture server readiness timed out')),
      60000,
    );
    server.once('exit', exited);
    server.once('error', exited);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill('SIGTERM');
  const waitForExit = (milliseconds: number) =>
    new Promise<boolean>((resolvePromise) => {
      if (server.exitCode !== null || server.signalCode !== null) {
        resolvePromise(true);
        return;
      }
      const finish = (exited: boolean) => {
        clearTimeout(timer);
        server.removeListener('exit', onExit);
        resolvePromise(exited);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(false), milliseconds);
      server.once('exit', onExit);
    });
  await waitForExit(10000);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await waitForExit(5000);
    if (server.exitCode === null && server.signalCode === null)
      throw new Error('Fixture server did not stop');
  }
}

function createDependencies(): LoadOrchestratorDependencies {
  let port = 0;
  return {
    async provision() {
      port = await allocateLoopbackPort();
      const runSuffix = randomUUID().replace(/-/g, '');
      const resources = await provisionDisposableFixture({
        baseEnvironment: safeBaseEnvironment(),
        databaseName: `devsync_e2e_load_${runSuffix}`,
        port,
        quiet: true,
      });
      const origin = `http://127.0.0.1:${port}`;
      return {
        environment: resources.environment,
        origin,
        apiBaseUrl: `${origin}/api`,
        capability: resources.environment.E2E_RUN_SECRET!,
        workspaceId,
        documentId,
        cleanup: resources.cleanup,
      };
    },
    async startServer(fixture) {
      if (!isSafeLocalOrigin(fixture.origin)) throw new Error('Unsafe fixture origin');
      const environment = createFixtureServerEnvironment(fixture);
      const child = spawn(process.execPath, ['--import', 'tsx', 'testing/server.ts'], {
        cwd: backend,
        env: environment,
        shell: false,
        stdio: 'ignore',
      });
      await new Promise<void>((resolvePromise, reject) => {
        child.once('spawn', () => resolvePromise());
        child.once('error', () => reject(new Error('Fixture server could not start')));
      });
      return child;
    },
    waitUntilReady: waitForServer,
    verifyPreflight: verifyFixturePreflight,
    authenticateOwner: authenticateSyntheticOwner,
    launch: launchFixtureSmoke,
    stopServer,
  };
}

async function main() {
  const preflightOnly = process.env.LOAD_SMOKE_PREFLIGHT_ONLY === '1';
  let startupStage: 'fixture_configuration' | 'k6_runtime' | 'fixture_setup' =
    'fixture_configuration';
  try {
    if (process.env.RUN_ISOLATED_K6_SMOKE !== '1') throw new Error('Load smoke opt-in is required');
    if (process.env.LOAD_SMOKE_PREFLIGHT_ONLY && !preflightOnly)
      throw new Error('Preflight-only mode must be explicitly set to 1');
    validateLocalContainerRuntime(process.env);
    if (!preflightOnly) {
      startupStage = 'k6_runtime';
      if (!(await hasK6Executable(process.env.PATH || '/usr/local/bin:/usr/bin:/bin')))
        throw new Error('k6 executable is unavailable');
    }
    startupStage = 'fixture_setup';
  } catch {
    console.error(`Isolated k6 smoke could not start; failure stage: ${startupStage}`);
    process.exitCode = 1;
    return;
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const result = await runFixtureLoadSmoke(createDependencies(), controller.signal, {
      preflightOnly,
    });
    console.log(`Isolated k6 smoke outcome: ${result.outcome}`);
    if (result.failureStage) console.error(`Sanitized failure stage: ${result.failureStage}`);
    if (result.cleanupFailed) console.error('One or more disposable cleanup steps failed');
    if (result.outcome === 'preflight_complete') {
      console.log(
        'Disposable fixture startup, readiness, capability preflight and owner authentication passed; k6 was not launched',
      );
      process.exitCode = 0;
      return;
    }
    if (result.smoke?.metrics) {
      const measuredAt = new Date().toISOString();
      const fileName = `smoke-${measuredAt.replace(/[:.]/g, '-')}-${randomUUID()}.json`;
      await mkdir(resultsDirectory, { recursive: true });
      await writeFile(
        resolve(resultsDirectory, fileName),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            measuredAt,
            nodeVersion: process.version,
            outcome: result.outcome,
            k6ExitStatus: result.smoke.status,
            metrics: result.smoke.metrics,
          },
          null,
          2,
        )}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
      console.log(`Sanitized measurements saved under docs/quality/phase16-load-restore/results`);
    } else if (result.outcome === 'completed') {
      console.error('k6 completed without a readable sanitized summary');
      process.exitCode = 1;
      return;
    }
    process.exitCode = result.exitCode;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error('Isolated k6 smoke could not complete; details were withheld for secret safety');
    process.exitCode = 1;
  });
