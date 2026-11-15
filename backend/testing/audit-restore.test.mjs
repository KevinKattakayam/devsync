import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import * as Y from 'yjs';

test(
  'restores a synthetic Yjs journal and row count into a disposable database',
  { timeout: 120000 },
  async () => {
    const container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const source = new pg.Client({ connectionString: container.getConnectionUri() });
    let restored;
    try {
      await source.connect();
      const doc = new Y.Doc();
      doc.getText('content').insert(0, 'Synthetic restore drill');
      const update = Buffer.from(Y.encodeStateAsUpdate(doc));
      await source.query(
        'CREATE TABLE audit_journal (id integer PRIMARY KEY, update_bytes bytea NOT NULL)',
      );
      await source.query('INSERT INTO audit_journal VALUES ($1, $2)', [1, update]);
      const dump = await container.exec([
        'pg_dump',
        '-U',
        container.getUsername(),
        '-Fc',
        '-f',
        '/tmp/audit-restore.dump',
        container.getDatabase(),
      ]);
      assert.equal(dump.exitCode, 0, 'synthetic backup must succeed');
      await source.query('CREATE DATABASE audit_restore_target');
      const restore = await container.exec([
        'pg_restore',
        '-U',
        container.getUsername(),
        '-d',
        'audit_restore_target',
        '/tmp/audit-restore.dump',
      ]);
      assert.equal(restore.exitCode, 0, 'synthetic restore must succeed');
      const uri = new URL(container.getConnectionUri());
      uri.pathname = '/audit_restore_target';
      restored = new pg.Client({ connectionString: uri.toString() });
      await restored.connect();
      const result = await restored.query('SELECT id, update_bytes FROM audit_journal ORDER BY id');
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].id, 1);
      const recovered = new Y.Doc();
      Y.applyUpdate(recovered, result.rows[0].update_bytes);
      assert.equal(recovered.getText('content').toString(), 'Synthetic restore drill');
    } finally {
      await Promise.allSettled([restored?.end(), source.end()]);
      await container.stop();
    }
  },
);
