import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { Client } from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import { FixtureSetupError, type LoadFailureStage } from './load-diagnostics';

const root = resolve(__dirname, '../..');

async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv, quiet: boolean) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: quiet ? 'ignore' : 'inherit' });
  const code = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('exit', done);
  });
  if (code !== 0) throw new Error('Disposable fixture preparation command failed');
}

export interface DisposableFixture {
  environment: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

export interface DisposableFixtureOptions {
  baseEnvironment: NodeJS.ProcessEnv;
  databaseName: string;
  port: number;
  quiet?: boolean;
}

/** Shared disposable PostgreSQL/Redis provisioning used by browser and load fixtures. */
export async function provisionDisposableFixture({
  baseEnvironment,
  databaseName,
  port,
  quiet = false,
}: DisposableFixtureOptions): Promise<DisposableFixture> {
  if (
    baseEnvironment.NODE_ENV !== 'test' ||
    !/^devsync_e2e_[a-z0-9_]{1,48}$/.test(databaseName) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new FixtureSetupError('fixture_configuration');

  let postgres: Awaited<ReturnType<PostgreSqlContainer['start']>>;
  try {
    postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase(databaseName)
      .start();
  } catch {
    throw new FixtureSetupError('postgres_start');
  }
  let redis: Awaited<ReturnType<GenericContainer['start']>> | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    let failed = false;
    if (redis) {
      try {
        await redis.stop();
      } catch {
        failed = true;
      }
    }
    try {
      await postgres.stop();
    } catch {
      failed = true;
    }
    if (failed) throw new Error('Disposable fixture cleanup failed');
  };

  let stage: LoadFailureStage = 'redis_start';
  try {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const env: NodeJS.ProcessEnv = {
      ...baseEnvironment,
      NODE_ENV: 'test',
      AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:3001',
      FEATURE_AUTOMATION: baseEnvironment.E2E_AUTOMATION ? 'true' : 'false',
      NEXT_PUBLIC_FEATURE_AUTOMATION: baseEnvironment.E2E_AUTOMATION ? 'true' : 'false',
      FEATURE_GROUNDED_AI: baseEnvironment.E2E_GROUNDED ? 'true' : 'false',
      NEXT_PUBLIC_FEATURE_GROUNDED_AI: baseEnvironment.E2E_GROUNDED ? 'true' : 'false',
      AI_QUOTA_USER_DAILY: baseEnvironment.E2E_AI_COST ? '1' : baseEnvironment.AI_QUOTA_USER_DAILY,
      FEATURE_ASYNC_DIGEST: baseEnvironment.E2E_ASYNC_DIGEST
        ? 'true'
        : baseEnvironment.FEATURE_ASYNC_DIGEST,
      FEATURE_SNIPPET_SAFETY: baseEnvironment.E2E_SNIPPET_SAFETY
        ? 'true'
        : baseEnvironment.FEATURE_SNIPPET_SAFETY,
      FEATURE_DECISION_RECEIPTS:
        baseEnvironment.E2E_DECISIONS || baseEnvironment.E2E_DECISION_EXECUTION
          ? 'true'
          : baseEnvironment.FEATURE_DECISION_RECEIPTS,
      E2E_UI_CAPTURE: baseEnvironment.E2E_UI_CAPTURE,
      E2E_RECOVERY: baseEnvironment.E2E_RECOVERY,
      DATABASE_URL: postgres.getConnectionUri(),
      E2E_ADMIN_DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      GITHUB_APP_ID: baseEnvironment.E2E_GITHUB_TRAIL ? '123' : '',
      GITHUB_APP_WEBHOOK_SECRET: baseEnvironment.E2E_GITHUB_TRAIL
        ? randomBytes(32).toString('hex')
        : '',
      GITHUB_APP_PRIVATE_KEY: '',
      CLERK_SECRET_KEY: '',
      CLERK_PUBLISHABLE_KEY: '',
      GROQ_API_KEY: '',
      OPENAI_API_KEY: '',
      FRONTEND_URL: 'http://127.0.0.1:3001',
      PORT: String(port),
      E2E_RUN_SECRET: randomBytes(32).toString('hex'),
      ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      SUPERADMIN_SERVICE_TOKEN: randomBytes(32).toString('hex'),
      STRIPE_SECRET_KEY: `sk_test_${randomBytes(24).toString('hex')}`,
      STRIPE_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      SEED_ALLOW_WRITE: 'true',
      SEED_OWNER_CLERK_ID: 'user_fixture_owner',
      SEED_EDITOR_CLERK_ID: 'user_fixture_editor',
      SEED_VIEWER_CLERK_ID: 'user_fixture_viewer',
    };
    stage = 'migration';
    await run(
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      resolve(root, 'backend'),
      env,
      quiet,
    );
    stage = 'seed';
    await run(
      ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
      resolve(root, 'backend'),
      env,
      quiet,
    );
    stage = 'runtime_role';
    const connection = new Client({ connectionString: env.DATABASE_URL });
    await connection.connect();
    try {
      const password = randomBytes(24).toString('hex');
      await connection.query(`CREATE ROLE browser_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO browser_runtime;
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO browser_runtime;
        GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO browser_runtime`);
      const url = new URL(env.DATABASE_URL!);
      url.username = 'browser_runtime';
      url.password = password;
      env.DATABASE_URL = url.toString();
    } finally {
      await connection.end();
    }
    return { environment: env, cleanup };
  } catch (error) {
    let cleanupFailed = false;
    try {
      await cleanup();
    } catch {
      cleanupFailed = true;
    }
    if (error instanceof FixtureSetupError)
      throw new FixtureSetupError(error.stage, cleanupFailed || error.cleanupFailed);
    throw new FixtureSetupError(stage, cleanupFailed);
  }
}
