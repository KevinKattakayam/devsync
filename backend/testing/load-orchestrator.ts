import type { ChildProcess } from 'child_process';
import type { FixtureLoadConnection, SmokeResult } from './k6-launcher';
import { launchFixtureSmoke } from './k6-launcher';
import { FixtureSetupError, type LoadFailureStage } from './load-diagnostics';

export interface ProvisionedLoadFixture {
  environment: NodeJS.ProcessEnv;
  origin: string;
  apiBaseUrl: string;
  capability: string;
  workspaceId: string;
  documentId: string;
  cleanup(): Promise<void>;
}

export interface LoadFixtureAuthentication {
  accessToken: string;
  logout(): Promise<void>;
}

export type LoadOutcome =
  | 'completed'
  | 'preflight_complete'
  | 'fixture_setup_failed'
  | 'server_start_failed'
  | 'fixture_verification_failed'
  | 'authentication_failed'
  | 'load_failed'
  | 'cancelled'
  | 'cleanup_failed';

export interface LoadOrchestrationResult {
  exitCode: number;
  outcome: LoadOutcome;
  smoke: SmokeResult | null;
  failureStage: LoadFailureStage | null;
  cleanupFailed: boolean;
}

export interface LoadOrchestrationOptions {
  preflightOnly?: boolean;
}

export interface LoadOrchestratorDependencies {
  provision(): Promise<ProvisionedLoadFixture>;
  startServer(fixture: ProvisionedLoadFixture): Promise<ChildProcess>;
  waitUntilReady(server: ChildProcess, origin: string, signal?: AbortSignal): Promise<void>;
  verifyPreflight(fixture: ProvisionedLoadFixture, signal?: AbortSignal): Promise<void>;
  authenticateOwner(
    fixture: ProvisionedLoadFixture,
    signal?: AbortSignal,
  ): Promise<LoadFixtureAuthentication>;
  launch(connection: FixtureLoadConnection, signal?: AbortSignal): Promise<SmokeResult>;
  stopServer(server: ChildProcess): Promise<void>;
}

function cancelled(signal?: AbortSignal) {
  return Boolean(signal?.aborted);
}

function validDisposableFixture(fixture: ProvisionedLoadFixture): boolean {
  try {
    const origin = new URL(fixture.origin);
    const database = new URL(fixture.environment.DATABASE_URL || '');
    const redis = new URL(fixture.environment.REDIS_URL || '');
    return (
      fixture.environment.NODE_ENV === 'test' &&
      origin.protocol === 'http:' &&
      origin.hostname === '127.0.0.1' &&
      origin.port !== '' &&
      origin.pathname === '/' &&
      origin.username === '' &&
      origin.password === '' &&
      fixture.apiBaseUrl === `${origin.origin}/api` &&
      ['postgres:', 'postgresql:'].includes(database.protocol) &&
      database.username === 'browser_runtime' &&
      ['localhost', '127.0.0.1', '::1'].includes(database.hostname) &&
      database.port !== '' &&
      /^\/devsync_e2e_[a-z0-9_]+$/.test(database.pathname) &&
      redis.protocol === 'redis:' &&
      ['localhost', '127.0.0.1', '::1'].includes(redis.hostname) &&
      redis.port !== '' &&
      redis.username === '' &&
      redis.password === '' &&
      /^[a-f0-9]{64}$/.test(fixture.capability) &&
      fixture.environment.E2E_RUN_SECRET === fixture.capability &&
      /^[A-Za-z0-9_-]{1,191}$/.test(fixture.workspaceId) &&
      /^[A-Za-z0-9_-]{1,191}$/.test(fixture.documentId)
    );
  } catch {
    return false;
  }
}

/** Owns the fixture, server, fixture session and k6 child through every exit path. */
export async function runFixtureLoadSmoke(
  dependencies: LoadOrchestratorDependencies,
  signal?: AbortSignal,
  options: LoadOrchestrationOptions = {},
): Promise<LoadOrchestrationResult> {
  let fixture: ProvisionedLoadFixture | undefined;
  let server: ChildProcess | undefined;
  let authentication: LoadFixtureAuthentication | undefined;
  let outcome: LoadOutcome = 'fixture_setup_failed';
  let smoke: SmokeResult | null = null;
  let cleanupFailed = false;
  let failureStage: LoadFailureStage | null = null;
  let currentStage: LoadFailureStage = 'fixture_setup';

  try {
    if (cancelled(signal)) {
      outcome = 'cancelled';
      failureStage = 'cancelled';
    } else {
      fixture = await dependencies.provision();
      outcome = 'fixture_setup_failed';
      currentStage = 'fixture_validation';
      if (!validDisposableFixture(fixture)) throw new Error('Disposable fixture validation failed');
      outcome = 'server_start_failed';
      if (cancelled(signal)) outcome = 'cancelled';
      else {
        currentStage = 'fixture_server_start';
        server = await dependencies.startServer(fixture);
        currentStage = 'fixture_server_readiness';
        await dependencies.waitUntilReady(server, fixture.origin, signal);
        outcome = 'fixture_verification_failed';
        currentStage = 'fixture_preflight';
        await dependencies.verifyPreflight(fixture, signal);
        outcome = 'authentication_failed';
        if (cancelled(signal)) outcome = 'cancelled';
        else {
          currentStage = 'owner_authentication';
          authentication = await dependencies.authenticateOwner(fixture, signal);
          if (options.preflightOnly) outcome = 'preflight_complete';
          else {
            outcome = 'load_failed';
            currentStage = 'k6_launch';
            const connection: FixtureLoadConnection = {
              baseUrl: fixture.apiBaseUrl,
              capability: fixture.capability,
              accessToken: authentication.accessToken,
              workspaceId: fixture.workspaceId,
              documentId: fixture.documentId,
            };
            smoke = await dependencies.launch(connection, signal);
            outcome =
              smoke.error === 'cancelled' || cancelled(signal)
                ? 'cancelled'
                : smoke.error === null && smoke.status === 0
                  ? 'completed'
                  : 'load_failed';
          }
        }
      }
    }
  } catch (error) {
    if (cancelled(signal)) {
      outcome = 'cancelled';
      failureStage = 'cancelled';
    } else {
      failureStage = error instanceof FixtureSetupError ? error.stage : currentStage;
      cleanupFailed = error instanceof FixtureSetupError && error.cleanupFailed;
    }
    // Deliberately omit exception details: setup errors can contain connection strings or tokens.
  } finally {
    if (authentication) {
      try {
        await authentication.logout();
      } catch {
        cleanupFailed = true;
      }
    }
    if (server) {
      try {
        await dependencies.stopServer(server);
      } catch {
        cleanupFailed = true;
      }
    }
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch {
        cleanupFailed = true;
      }
    }
  }

  if (cleanupFailed) {
    outcome = 'cleanup_failed';
    failureStage ??= 'cleanup';
  }
  const succeeded = outcome === 'completed' || outcome === 'preflight_complete';
  return { exitCode: succeeded ? 0 : 1, outcome, smoke, failureStage, cleanupFailed };
}
