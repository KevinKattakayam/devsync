import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFixtureMode, createFixtureDirectory } from '../testing/prepare.mjs';

test('fixture generator refuses production, development and unset modes', () => {
  for (const mode of ['production', 'development', undefined, '']) {
    assert.throws(() => assertFixtureMode(mode), /requires NODE_ENV=test/);
  }
  assert.doesNotThrow(() => assertFixtureMode('test'));
});
test('fixture generator creates the ignored parent while refusing to reuse an existing target', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'devsync-fixture-parent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, '.worktrees', 'frontend-fixture');

  await createFixtureDirectory(target);
  await access(target);
  await assert.rejects(createFixtureDirectory(target), { code: 'EEXIST' });
});
test('production source cannot select or import the test authentication adapter', async () => {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await inspect(path);
      else {
        const source = await readFile(path, 'utf8');
        assert.doesNotMatch(
          source,
          /__test|E2E_RUN_SECRET|testing\/auth-provider|fixture_session/,
          path,
        );
      }
    }
  }
  await inspect('src');
});
