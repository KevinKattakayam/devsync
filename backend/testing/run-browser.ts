import { randomUUID } from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { rename, cp, readFile, writeFile, symlink } from 'fs/promises';
import { parse } from 'dotenv';
import { provisionDisposableFixture } from './fixture-lifecycle';

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
  const deadline = Date.now() + (process.env.E2E_UI_CAPTURE ? 180000 : 90000);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Browser fixture process exited before readiness');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
  const fixture = await provisionDisposableFixture({
    baseEnvironment: process.env,
    databaseName: 'devsync_e2e_browser',
    port: 5501,
  });
  const children: ChildProcess[] = [];
  const env = fixture.environment;
  try {
    let target = resolve(root, '.worktrees/frontend-fixture');
    try {
      await rename(target, `/tmp/devsync-fixture-${randomUUID()}`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    await run(['testing/prepare.mjs'], resolve(root, 'frontend'), env);
    const frontendEnvironment: NodeJS.ProcessEnv = { ...env, NODE_ENV: 'development' };
    if (env.E2E_UI_CAPTURE) {
      const clerk = parse(await readFile(resolve(root, 'frontend/.env.local')));
      frontendEnvironment.CLERK_SECRET_KEY = clerk.CLERK_SECRET_KEY;
      frontendEnvironment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
        clerk.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
      if (env.E2E_UI_CAPTURE === 'before') {
        const original = resolve(root, '.worktrees/phase1e-main/frontend');
        await cp(
          resolve(target, 'src/providers/auth-provider.tsx'),
          resolve(original, 'src/providers/auth-provider.tsx'),
        );
        await cp(resolve(target, 'src/proxy.ts'), resolve(original, 'src/proxy.ts'));
        await cp(resolve(target, 'next.config.ts'), resolve(original, 'next.config.ts'));
        try {
          await symlink(
            resolve(root, '.worktrees/phase1b-main/frontend/node_modules'),
            resolve(original, 'node_modules'),
            'dir',
          );
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        }
        target = original;
      } else if (env.E2E_UI_CAPTURE === 'current') {
        // Capture the real public Clerk widgets, retaining the isolated product identity adapter.
        await cp(
          resolve(root, 'frontend/src/app/layout.tsx'),
          resolve(target, 'src/app/layout.tsx'),
        );
        for (const path of ['login', 'signup', 'sign-in', 'sign-up'])
          await cp(
            resolve(root, `frontend/src/app/(auth)/${path}`),
            resolve(target, `src/app/(auth)/${path}`),
            { recursive: true },
          );
      } else throw new Error('Unknown UI capture target');
    }
    let generation = 0;
    let restarting: Promise<void> | undefined;
    const startBackend = () => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'testing/server.ts'], {
        cwd: resolve(root, 'backend'),
        env: { ...env, E2E_GENERATION: String(generation) },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
      children.push(child);
      child.on('message', (message: unknown) => {
        if (env.E2E_RECOVERY !== '1' || message !== 'recovery:crash' || restarting) return;
        restarting = (async () => {
          const exited = new Promise<void>((done) => child.once('exit', () => done()));
          child.kill('SIGKILL');
          await exited;
          generation += 1;
          const replacement = startBackend();
          await ready('http://127.0.0.1:5501/api/health', replacement);
        })()
          .catch(() => {
            console.error('Recovery fixture restart failed');
          })
          .finally(() => {
            restarting = undefined;
          });
      });
      return child;
    };
    const backend = startBackend();
    await ready('http://127.0.0.1:5501/api/health', backend);
    if (process.env.E2E_AUTOMATION) {
      const worker = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
        cwd: resolve(root, 'backend'),
        env,
        stdio: 'inherit',
      });
      children.push(worker);
    }
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
        env: frontendEnvironment,
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
          if (child.exitCode !== null || child.signalCode !== null) done(null);
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
    await fixture.cleanup();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser orchestration failed');
  process.exitCode = 1;
});
