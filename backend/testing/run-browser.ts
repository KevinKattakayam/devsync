import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import { Client } from 'pg';
import { randomBytes, randomUUID } from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { rename } from 'fs/promises';

const root = resolve(__dirname, '../..');
async function run(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  const code = await new Promise<number | null>((done, reject) => {
    child.once('error', reject);
    child.once('exit', done);
  });
  if (code !== 0) throw new Error(`Browser orchestration command exited ${code}`);
}
async function ready(url: string, child: ChildProcess) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Browser fixture process exited before readiness');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* Startup polling only; bounded by deadline. */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Browser fixture readiness timed out: ${url}`);
}
async function main() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Browser orchestration requires test mode');
  const postgres = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devsync_e2e_browser')
    .start();
  const children: ChildProcess[] = [];
  let redis: Awaited<ReturnType<GenericContainer['start']>> | undefined;
  try {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      CLERK_SECRET_KEY: '',
      CLERK_PUBLISHABLE_KEY: '',
      GROQ_API_KEY: '',
      OPENAI_API_KEY: '',
      FRONTEND_URL: 'http://127.0.0.1:3001',
      PORT: '5501',
      E2E_RUN_SECRET: randomBytes(32).toString('hex'),
      SEED_ALLOW_WRITE: 'true',
      SEED_OWNER_CLERK_ID: 'user_fixture_owner',
      SEED_EDITOR_CLERK_ID: 'user_fixture_editor',
      SEED_VIEWER_CLERK_ID: 'user_fixture_viewer',
    };
    await run(
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      resolve(root, 'backend'),
      env,
    );
    await run(['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], resolve(root, 'backend'), env);
    const connection = new Client({ connectionString: env.DATABASE_URL });
    await connection.connect();
    try {
      const password = randomBytes(24).toString('hex');
      await connection.query(`CREATE ROLE browser_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public TO browser_runtime;
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO browser_runtime;
        GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO browser_runtime`);
      const url = new URL(env.DATABASE_URL);
      url.username = 'browser_runtime';
      url.password = password;
      env.DATABASE_URL = url.toString();
    } finally {
      await connection.end();
    }
    const target = resolve(root, '.worktrees/frontend-fixture');
    try {
      await rename(target, `/tmp/devsync-fixture-${randomUUID()}`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    await run(['testing/prepare.mjs'], resolve(root, 'frontend'), env);
    const backend = spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'testing/server.ts'],
      {
        cwd: resolve(root, 'backend'),
        env,
        stdio: 'inherit',
      },
    );
    children.push(backend);
    await ready('http://127.0.0.1:5501/api/health', backend);
    const frontend = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'dev',
        '--webpack',
        '--hostname',
        '127.0.0.1',
        '--port',
        '3001',
      ],
      {
        cwd: target,
        env: { ...env, NODE_ENV: 'development' },
        stdio: 'inherit',
      },
    );
    children.push(frontend);
    await ready('http://127.0.0.1:3001/login', frontend);
    await run(
      ['node_modules/@playwright/test/cli.js', 'test', '-c', 'testing/browser.config.ts'],
      resolve(root, 'backend'),
      env,
    );
  } finally {
    for (const child of children.reverse()) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((done) => {
          if (child.exitCode !== null) done(null);
          else child.once('exit', done);
        }),
        new Promise((done) =>
          setTimeout(() => {
            child.kill('SIGKILL');
            done(null);
          }, 15000),
        ),
      ]);
    }
    await redis?.stop();
    await postgres.stop();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser orchestration failed');
  process.exitCode = 1;
});
