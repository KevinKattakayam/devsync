import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCoverage } from './coverage.mjs';
const fixture = (percent) => ({
  total: Object.fromEntries(
    ['statements', 'branches', 'functions', 'lines'].map((metric) => [metric, { pct: percent }]),
  ),
});
test('coverage gate rejects a drop in any metric and cannot pass missing data', () => {
  assert.doesNotThrow(() => compareCoverage(fixture(81), fixture(80)));
  assert.doesNotThrow(() => compareCoverage(fixture(80), fixture(80)));
  for (const metric of ['statements', 'branches', 'functions', 'lines']) {
    const current = fixture(80);
    current.total[metric].pct = 79.99;
    assert.throws(() => compareCoverage(current, fixture(80)), /Coverage decreased/);
  }
  assert.throws(() => compareCoverage({}, fixture(80)), /Invalid coverage/);
});
