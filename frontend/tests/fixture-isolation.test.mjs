import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { assertFixtureMode } from '../testing/prepare.mjs';

test('fixture generator refuses production, development and unset modes', () => {
  for (const mode of ['production', 'development', undefined, '']) {
    assert.throws(() => assertFixtureMode(mode), /requires NODE_ENV=test/);
  }
  assert.doesNotThrow(() => assertFixtureMode('test'));
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
