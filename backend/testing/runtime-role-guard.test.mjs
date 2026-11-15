import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { assertRuntimeRole } from '../docker/runtime-role-guard.mjs';

test('rejects missing or incomplete role data and propagates query failures', async () => {
  await assert.rejects(
    () => assertRuntimeRole({ $queryRaw: async () => [] }),
    /Unsafe database runtime role/,
  );
  await assert.rejects(
    () => assertRuntimeRole({ $queryRaw: async () => [{}] }),
    /Unsafe database runtime role/,
  );
  await assert.rejects(
    () =>
      assertRuntimeRole({
        $queryRaw: async () => {
          throw new Error('query failed');
        },
      }),
    /query failed/,
  );
});

test(
  'runtime privilege guard rejects dangerous effective privileges in disposable PostgreSQL 16',
  { timeout: 120000 },
  async () => {
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const admin = new pg.Client({ connectionString: container.getConnectionUri() });
    let runtime;
    try {
      await admin.connect();
      await admin.query(
        "CREATE ROLE phase17_runtime LOGIN PASSWORD 'fixture_only' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; CREATE ROLE phase17_extra NOLOGIN; CREATE TABLE public.phase17_item(id int); CREATE FUNCTION public.phase17_func() RETURNS integer LANGUAGE SQL AS 'SELECT 1'; CREATE TYPE public.phase17_type AS ENUM ('a')",
      );
      const uri = new URL(container.getConnectionUri());
      uri.username = 'phase17_runtime';
      uri.password = 'fixture_only';
      runtime = new PrismaClient({ datasources: { db: { url: uri.toString() } } });
      const db = runtime;
      await assert.doesNotReject(() => assertRuntimeRole(db));
      for (const [grant, revoke] of [
        ['GRANT phase17_extra TO phase17_runtime', 'REVOKE phase17_extra FROM phase17_runtime'],
        [
          'GRANT CREATE ON SCHEMA public TO phase17_runtime',
          'REVOKE CREATE ON SCHEMA public FROM phase17_runtime',
        ],
        [
          'GRANT TRIGGER ON public.phase17_item TO phase17_runtime',
          'REVOKE TRIGGER ON public.phase17_item FROM phase17_runtime',
        ],
        [
          'GRANT TRUNCATE ON public.phase17_item TO phase17_runtime',
          'REVOKE TRUNCATE ON public.phase17_item FROM phase17_runtime',
        ],
        [
          `GRANT CREATE ON DATABASE "${container.getDatabase()}" TO phase17_runtime`,
          `REVOKE CREATE ON DATABASE "${container.getDatabase()}" FROM phase17_runtime`,
        ],
        [
          'ALTER TABLE public.phase17_item OWNER TO phase17_runtime',
          'ALTER TABLE public.phase17_item OWNER TO CURRENT_USER',
        ],
        [
          'ALTER FUNCTION public.phase17_func() OWNER TO phase17_runtime',
          'ALTER FUNCTION public.phase17_func() OWNER TO CURRENT_USER',
        ],
        [
          'ALTER TYPE public.phase17_type OWNER TO phase17_runtime',
          'ALTER TYPE public.phase17_type OWNER TO CURRENT_USER',
        ],
        ['ALTER ROLE phase17_runtime CREATEDB', 'ALTER ROLE phase17_runtime NOCREATEDB'],
        ['ALTER ROLE phase17_runtime CREATEROLE', 'ALTER ROLE phase17_runtime NOCREATEROLE'],
        ['ALTER ROLE phase17_runtime BYPASSRLS', 'ALTER ROLE phase17_runtime NOBYPASSRLS'],
        ['ALTER ROLE phase17_runtime SUPERUSER', 'ALTER ROLE phase17_runtime NOSUPERUSER'],
      ]) {
        await admin.query(grant);
        await assert.rejects(() => assertRuntimeRole(db), /Unsafe database runtime role/);
        await admin.query(revoke);
        await assert.doesNotReject(() => assertRuntimeRole(db));
      }
    } finally {
      await runtime?.$disconnect();
      await admin.end();
      await container.stop();
    }
  },
);
