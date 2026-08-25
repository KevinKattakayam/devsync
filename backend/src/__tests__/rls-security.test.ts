import { Client } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';

jest.setTimeout(120_000);

describe('PostgreSQL RLS tenant kernel isolation', () => {
  let container: StartedPostgreSqlContainer;
  let admin: Client;
  let app: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(`
      CREATE ROLE app_user LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS;
      CREATE TABLE "Document" (id text primary key, "workspaceId" text not null, title text);
      CREATE TABLE "Snippet" (id text primary key, "workspaceId" text not null);
      CREATE TABLE "Board" (id text primary key, "workspaceId" text not null);
      CREATE TABLE "Column" (id text primary key, "boardId" text not null references "Board"(id));
      CREATE TABLE "Task" (id text primary key, "columnId" text not null references "Column"(id));
      INSERT INTO "Document" VALUES ('doc-a','tenant-a','A'), ('doc-b','tenant-b','B');
      INSERT INTO "Snippet" VALUES ('snippet-a','tenant-a'), ('snippet-b','tenant-b');
      INSERT INTO "Board" VALUES ('board-a','tenant-a'), ('board-b','tenant-b');
      INSERT INTO "Column" VALUES ('column-a','board-a'), ('column-b','board-b');
      INSERT INTO "Task" VALUES ('task-a','column-a'), ('task-b','column-b');
      ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "Snippet" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Snippet" FORCE ROW LEVEL SECURITY;
      ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
      CREATE POLICY document_tenant ON "Document" FOR ALL USING ("workspaceId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
      CREATE POLICY snippet_tenant ON "Snippet" FOR ALL USING ("workspaceId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
      CREATE POLICY task_tenant ON "Task" FOR ALL USING (EXISTS (SELECT 1 FROM "Column" c JOIN "Board" b ON b.id=c."boardId" WHERE c.id="Task"."columnId" AND b."workspaceId"=current_setting('app.current_tenant_id', true))) WITH CHECK (EXISTS (SELECT 1 FROM "Column" c JOIN "Board" b ON b.id=c."boardId" WHERE c.id="Task"."columnId" AND b."workspaceId"=current_setting('app.current_tenant_id', true)));
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
    `);
    app = new Client({ host: container.getHost(), port: container.getPort(), database: container.getDatabase(), user: 'app_user', password: 'app_password' });
    await app.connect();
  });

  afterAll(async () => { await app.end(); await admin.end(); await container.stop(); });

  async function asTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
    await app.query('BEGIN');
    try { await app.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]); const result = await operation(); await app.query('COMMIT'); return result; }
    catch (error) { await app.query('ROLLBACK'); throw error; }
  }

  it('permits only same-tenant Document, Snippet, and Task reads', async () => {
    await asTenant('tenant-a', async () => {
      await expect(app.query('SELECT id FROM "Document" ORDER BY id')).resolves.toMatchObject({ rows: [{ id: 'doc-a' }] });
      await expect(app.query('SELECT id FROM "Snippet" ORDER BY id')).resolves.toMatchObject({ rows: [{ id: 'snippet-a' }] });
      await expect(app.query('SELECT id FROM "Task" ORDER BY id')).resolves.toMatchObject({ rows: [{ id: 'task-a' }] });
    });
  });

  it('blocks cross-tenant writes and resets LOCAL tenant state at commit', async () => {
    await expect(asTenant('tenant-a', () => app.query(`INSERT INTO "Document" VALUES ('forbidden','tenant-b','no')`))).rejects.toMatchObject({ code: '42501' });
    await expect(app.query('SELECT id FROM "Document"')).resolves.toMatchObject({ rows: [] });
  });
});
