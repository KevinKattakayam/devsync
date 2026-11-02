import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
if (process.env.DEPLOYMENT_MODE !== 'local')
  throw new Error('Local initializer refuses production');
const adminPassword = (await readFile('/state/admin/postgres-password', 'utf8')).trim();
const runtimePassword = (await readFile('/state/runtime/database-password', 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(runtimePassword)) throw new Error('Invalid local runtime credentials');
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://devsync_admin:${adminPassword}@postgres:5432/devsync?connect_timeout=3`,
};
function run(args, settings = env) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: settings });
  if (result.status !== 0) throw new Error('Local initialization command failed');
}
run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
run(['tooling/prisma/seed.js'], {
  ...env,
  NODE_ENV: 'development',
  SEED_ALLOW_WRITE: 'true',
  SEED_OWNER_CLERK_ID: process.env.SEED_OWNER_CLERK_ID || 'user_local_owner',
  SEED_EDITOR_CLERK_ID: process.env.SEED_EDITOR_CLERK_ID || 'user_local_editor',
  SEED_VIEWER_CLERK_ID: process.env.SEED_VIEWER_CLERK_ID || 'user_local_viewer',
});
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  await db.query("SELECT set_config('bootstrap.runtime_password', $1, false)", [runtimePassword]);
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='devsync_runtime') THEN
      CREATE ROLE devsync_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
    EXECUTE format('ALTER ROLE devsync_runtime PASSWORD %L', current_setting('bootstrap.runtime_password'));
  END $$`);
  await db.query('GRANT USAGE ON SCHEMA public TO devsync_runtime');
  await db.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO devsync_runtime',
  );
  await db.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO devsync_runtime');
} finally {
  await db.end();
}
console.log('Migrations, sample seed and non-bypass runtime grants complete.');
