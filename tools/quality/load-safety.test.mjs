import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLoadConfig, validateFixtureResponse } from './load-safety.mjs';
const capability = 'ab'.repeat(32);
const valid = {
  K6_BASE_URL: 'http://127.0.0.1:5501/api',
  K6_FIXTURE_CAPABILITY: capability,
  K6_ACCESS_TOKEN: 'fixture-token',
  K6_WORKSPACE_ID: 'workspace',
  K6_DOCUMENT_ID: 'doc',
};
const runId = '123e4567-e89b-42d3-a456-426614174000';
const body = JSON.stringify({ marker: 'devsync-isolated-fixture-v1', runId });
test('accepts only explicit loopback fixture configuration', () => {
  assert.equal(validateLoadConfig(valid).origin, 'http://127.0.0.1:5501');
  for (const value of [
    'http://localhost:5501/api',
    'http://127.0.0.1.evil:5501/api',
    'http://127.0.0.1:0/api',
    'http://127.0.0.1:5501/api?x=1',
    'https://example.com/api',
    'http://127.0.0.1:5501/api/other',
  ])
    assert.throws(() => validateLoadConfig({ ...valid, K6_BASE_URL: value }));
  for (const key of [
    'K6_FIXTURE_CAPABILITY',
    'K6_ACCESS_TOKEN',
    'K6_WORKSPACE_ID',
    'K6_DOCUMENT_ID',
  ])
    assert.throws(() => validateLoadConfig({ ...valid, [key]: '' }));
  assert.throws(() => validateLoadConfig({ ...valid, K6_FIXTURE_CAPABILITY: 'incorrect' }));
});
test('requires successful exact versioned proof and stable run identity', () => {
  assert.equal(validateFixtureResponse(200, body), runId);
  assert.throws(() => validateFixtureResponse(403, body));
  assert.throws(() => validateFixtureResponse(302, body));
  for (const value of [
    'bad json',
    '{}',
    JSON.stringify({ marker: 'devsync-isolated-fixture-v2', runId }),
    JSON.stringify({ marker: 'devsync-isolated-fixture-v1', runId: 'wrong' }),
    JSON.stringify({ marker: 'devsync-isolated-fixture-v1', runId, extra: 1 }),
  ])
    assert.throws(() => validateFixtureResponse(200, value));
  assert.throws(() => validateFixtureResponse(200, body, 'other-run'));
});
