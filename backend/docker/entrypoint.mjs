import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
try {
  if (process.env.DEPLOYMENT_MODE === 'local') {
    const password = (await readFile('/state/runtime/database-password', 'utf8')).trim();
    process.env.DATABASE_URL = `postgresql://devsync_runtime:${password}@postgres:5432/devsync?connect_timeout=3`;
    process.env.ENCRYPTION_KEY = (await readFile('/state/runtime/encryption-key', 'utf8')).trim();
  }
  const { validateEnvironment } = require('../dist/config-environment.js');
  validateEnvironment(process.env);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const [role] =
      await db.$queryRaw`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    if (!role || role.rolsuper || role.rolbypassrls)
      throw new Error('Unsafe database runtime role');
  } finally {
    await db.$disconnect();
  }
  const [command, ...args] = process.argv.slice(2);
  const child = spawn(command || process.execPath, args, { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    console.error('Backend executable failed');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(
    error.name === 'ConfigurationError'
      ? error.message
      : 'Backend startup failed; verify runtime settings, secrets and database role permissions',
  );
  process.exitCode = 1;
}
