import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(
  new URL('../../../.github/workflows/preview.yml', import.meta.url),
  'utf8',
);
test('staging workflow is manual, read-only scoped, quality gated and blocks promotion before deploy', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /node tools\/ci\/verify-quality\.mjs/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /environment: staging/);
  const gate = workflow.indexOf('node tools/ci/verify-staging-topology.mjs');
  assert.ok(gate > 0 && gate < workflow.indexOf('vercel@65.9.0 deploy'));
  assert.doesNotMatch(workflow, /--prod\b|environment: production/);
});
test('staging topology gate fails closed without verified release attestation', () => {
  const result = spawnSync(process.execPath, ['tools/ci/verify-staging-topology.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging promotion blocked/i);
});
