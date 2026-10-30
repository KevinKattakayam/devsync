import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

jest.setTimeout(180_000);
let database: StartedPostgreSqlContainer;
let admin: Client;
beforeAll(async () => {
  database = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  admin = new Client({ connectionString: database.getConnectionUri() });
  await admin.connect();
});
afterAll(async () => {
  if (admin) await admin.end();
  if (database) await database.stop();
});
function command(args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, args, {
    env: { ...process.env, DATABASE_URL: database.getConnectionUri(), ...extra },
    encoding: 'utf8',
    timeout: 90_000,
  });
}
it('G02 applies the actual migration chain to an empty pgvector database, retaining forced RLS', async () => {
  const migration = command(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  expect({ exit: migration.status, error: migration.stderr }).toEqual({ exit: 0, error: '' });
  const tables = await admin.query(
    `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('Document','Snippet','Task') ORDER BY relname`,
  );
  expect(tables.rows).toEqual(
    ['Document', 'Snippet', 'Task'].map((relname) => ({
      relname,
      relrowsecurity: true,
      relforcerowsecurity: true,
    })),
  );
  const password = randomBytes(24).toString('hex');
  await admin.query(
    `CREATE ROLE migration_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO migration_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO migration_runtime;`,
  );
  await admin.query(`INSERT INTO "User" (id,"clerkId",email,"updatedAt") VALUES ('fixture-user','user_fixture','fixture@example.test',NOW());
    INSERT INTO "Workspace" (id,name,slug,"updatedAt") VALUES ('fixture-a','A','fixture-a',NOW()), ('fixture-b','B','fixture-b',NOW());
    INSERT INTO "Document" (id,"workspaceId","authorId",title,"updatedAt") VALUES ('doc-a','fixture-a','fixture-user','A',NOW()),('doc-b','fixture-b','fixture-user','B',NOW());`);
  const connection = new URL(database.getConnectionUri());
  connection.username = 'migration_runtime';
  connection.password = password;
  const runtime = new Client({ connectionString: connection.toString() });
  await runtime.connect();
  try {
    expect((await runtime.query('SELECT id FROM "Document"')).rows).toEqual([]);
    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('app.current_tenant_id',$1,true)", ['fixture-a']);
    expect((await runtime.query('SELECT id FROM "Document"')).rows).toEqual([{ id: 'doc-a' }]);
    await runtime.query('COMMIT');
    expect((await runtime.query('SELECT id FROM "Document"')).rows).toEqual([]);
  } finally {
    await runtime.end();
  }
});
it('G12 installs indexes for tenant lists and relationship lookups', async () => {
  const names = (
    await admin.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)
  ).rows.map((row: { indexname: string }) => row.indexname);
  for (const name of [
    'Document_workspaceId_isArchived_updatedAt_idx',
    'Document_parentId_idx',
    'Task_columnId_position_idx',
    'Snippet_workspaceId_updatedAt_idx',
    'Activity_workspaceId_createdAt_idx',
    'Column_boardId_position_idx',
    'Board_workspaceId_idx',
  ])
    expect(names).toContain(name);
});
it('I09 seeds an idempotent workspace using explicit test identities without creating login credentials', async () => {
  const env = {
    SEED_ALLOW_WRITE: 'true',
    SEED_OWNER_CLERK_ID: 'user_fixture_owner',
    SEED_EDITOR_CLERK_ID: 'user_fixture_editor',
    SEED_VIEWER_CLERK_ID: 'user_fixture_viewer',
    NODE_ENV: 'test',
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const seed = command(['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], env);
    expect({ exit: seed.status, error: seed.stderr }).toEqual({ exit: 0, error: '' });
  }
  const roles = await admin.query(
    `SELECT role FROM "WorkspaceMember" WHERE "workspaceId"='devsync-sample' ORDER BY role`,
  );
  expect(roles.rows.map((row: { role: string }) => row.role).sort()).toEqual([
    'EDITOR',
    'OWNER',
    'VIEWER',
  ]);
});
it('D08 database rejects a document parent from another workspace', async () => {
  await expect(
    admin.query(
      `INSERT INTO "Document" (id,"workspaceId","authorId","parentId",title,"updatedAt") VALUES ('cross-parent-child','fixture-a','fixture-user','doc-b','Invalid',NOW())`,
    ),
  ).rejects.toMatchObject({ code: '23503' });
});
