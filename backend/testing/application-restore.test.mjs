import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import * as Y from 'yjs';

test(
  'restores the migrated application schema, Yjs journal and tenant policy',
  { timeout: 180000 },
  async () => {
    const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('devsync_e2e_restore')
      .start();
    const source = new pg.Client({ connectionString: container.getConnectionUri() });
    let target;
    try {
      const migration = spawnSync(
        process.execPath,
        ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
        {
          cwd: process.cwd(),
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            DATABASE_URL: container.getConnectionUri(),
          },
          stdio: 'ignore',
          timeout: 120000,
        },
      );
      assert.equal(migration.status, 0, 'disposable migrations must succeed');
      await source.connect();
      await source.query(`INSERT INTO "User" (id, "clerkId", email, "updatedAt") VALUES ('restore-user', 'restore-clerk', 'restore@example.invalid', NOW());
      INSERT INTO "Workspace" (id, name, slug, "updatedAt") VALUES ('restore-a', 'A', 'restore-a', NOW()), ('restore-b', 'B', 'restore-b', NOW());
      INSERT INTO "Document" (id, title, "authorId", "workspaceId", "updatedAt") VALUES ('restore-doc', 'Synthetic', 'restore-user', 'restore-a', NOW())`);
      const document = new Y.Doc();
      document.getText('content').insert(0, 'Synthetic application journal');
      const update = Buffer.from(Y.encodeStateAsUpdate(document));
      const digest = createHash('sha256').update(update).digest('hex');
      await source.query(
        'INSERT INTO "DocumentUpdate" ("documentId", "workspaceId", digest, update) VALUES ($1, $2, $3, $4)',
        ['restore-doc', 'restore-a', digest, update],
      );
      const tableNames = await source.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      const counts = async (client) => {
        const result = {};
        for (const { tablename } of tableNames.rows) {
          const identifier = `"${tablename.replaceAll('"', '""')}"`;
          result[tablename] = (
            await client.query(`SELECT count(*)::int AS count FROM ${identifier}`)
          ).rows[0].count;
        }
        return result;
      };
      const originalCounts = await counts(source);
      const dump = await container.exec([
        'pg_dump',
        '-U',
        container.getUsername(),
        '-Fc',
        '-f',
        '/tmp/application-restore.dump',
        container.getDatabase(),
      ]);
      assert.equal(dump.exitCode, 0, 'application-schema dump must succeed');
      await source.query('CREATE DATABASE devsync_e2e_restored');
      const restore = await container.exec([
        'pg_restore',
        '-U',
        container.getUsername(),
        '-d',
        'devsync_e2e_restored',
        '/tmp/application-restore.dump',
      ]);
      assert.equal(restore.exitCode, 0, 'application-schema restore must succeed');
      const uri = new URL(container.getConnectionUri());
      uri.pathname = '/devsync_e2e_restored';
      target = new pg.Client({ connectionString: uri.toString() });
      await target.connect();
      assert.deepEqual(
        (
          await target.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
          )
        ).rows,
        tableNames.rows,
      );
      const policies = `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`;
      assert.deepEqual((await target.query(policies)).rows, (await source.query(policies)).rows);
      const rls = `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`;
      assert.deepEqual((await target.query(rls)).rows, (await source.query(rls)).rows);
      assert.deepEqual(await counts(target), originalCounts);
      const stored = await target.query(
        'SELECT update FROM "DocumentUpdate" WHERE "documentId" = $1',
        ['restore-doc'],
      );
      assert.equal(stored.rows.length, 1);
      const recovered = new Y.Doc();
      Y.applyUpdate(recovered, stored.rows[0].update);
      assert.equal(recovered.getText('content').toString(), 'Synthetic application journal');
      await target.query(
        'CREATE ROLE audit_restore_reader NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO audit_restore_reader; GRANT SELECT ON "Document" TO audit_restore_reader',
      );
      await target.query('BEGIN; SET LOCAL ROLE audit_restore_reader');
      try {
        await target.query("SELECT set_config('app.current_tenant_id', 'restore-a', true)");
        assert.equal(
          (await target.query('SELECT count(*)::int AS count FROM "Document"')).rows[0].count,
          1,
        );
        await target.query("SELECT set_config('app.current_tenant_id', 'restore-b', true)");
        assert.equal(
          (await target.query('SELECT count(*)::int AS count FROM "Document"')).rows[0].count,
          0,
        );
      } finally {
        await target.query('ROLLBACK');
      }
    } finally {
      await Promise.allSettled([target?.end(), source.end()]);
      await container.stop();
    }
  },
);
