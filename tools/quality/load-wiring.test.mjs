import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const proof = JSON.stringify({
  marker: 'devsync-isolated-fixture-v1',
  runId: '123e4567-e89b-42d3-a456-426614174000',
});
const env = {
  K6_BASE_URL: 'http://127.0.0.1:5501/api',
  K6_FIXTURE_CAPABILITY: 'ab'.repeat(32),
  K6_ACCESS_TOKEN: 'fixture-token',
  K6_WORKSPACE_ID: 'workspace',
  K6_DOCUMENT_ID: 'doc',
};
async function harness(statuses, smoke = false) {
  const calls = [];
  const context = vm.createContext({
    __ENV: env,
    JSON,
    Object,
    Error,
    Number,
    String,
    Array,
    RegExp,
    encodeURIComponent,
  });
  const mocks = {
    'k6/http': {
      default: {
        get(url, options) {
          calls.push({ url, options });
          return {
            status: url.includes('load-preflight') ? (statuses.shift() ?? 200) : 200,
            body: proof,
            timings: { duration: 1 },
          };
        },
      },
    },
    k6: { check() {}, sleep() {} },
    'k6/metrics': {
      Trend: class {
        add() {}
      },
    },
    'k6/execution': {
      default: {
        test: {
          abort() {
            throw new Error('aborted');
          },
        },
      },
    },
  };
  const safety = new vm.SourceTextModule(
    await readFile(new URL('./load-safety.mjs', import.meta.url), 'utf8'),
    { context },
  );
  const load = new vm.SourceTextModule(
    await readFile(new URL('./load.js', import.meta.url), 'utf8'),
    { context },
  );
  const entry = smoke
    ? new vm.SourceTextModule(await readFile(new URL('./load-smoke.js', import.meta.url), 'utf8'), {
        context,
      })
    : load;
  await entry.link((specifier) => {
    if (specifier === './load.js') return load;
    if (specifier === './load-safety.mjs') return safety;
    const values = mocks[specifier];
    assert.ok(values, `Unexpected import: ${specifier}`);
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context },
    );
  });
  await entry.evaluate();
  return { calls, module: entry.namespace };
}
test('setup rejection sends no workload requests', async () => {
  const h = await harness([403]);
  assert.throws(() => h.module.setup(), /preflight rejected/);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /__fixture\/load-preflight$/);
  assert.equal(h.calls[0].options.redirects, 0);
});
test('each iteration rechecks proof before workload requests', async () => {
  const h = await harness([200, 403]);
  const setup = h.module.setup();
  assert.throws(() => h.module.default(setup), /aborted/);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every((call) => call.url.includes('/__fixture/load-preflight')));
});
test('validated iteration keeps the four bounded reads without redirects', async () => {
  const h = await harness([200, 200]);
  const setup = h.module.setup();
  h.module.default(setup);
  assert.equal(h.calls.length, 6);
  assert.ok(h.calls.slice(2).every((call) => call.options.redirects === 0));
  assert.ok(h.calls.slice(2).every((call) => call.url.startsWith(env.K6_BASE_URL)));
});
test('smoke entry fixes the VU and duration bounds and retains the fixture gate', async () => {
  const h = await harness([403], true);
  assert.equal(h.module.options.scenarios.reads.vus, 2);
  assert.equal(h.module.options.scenarios.reads.duration, '15s');
  assert.equal(h.module.options.scenarios.reads.gracefulStop, '0s');
  assert.ok(h.module.options.summaryTrendStats.includes('p(99)'));
  assert.throws(() => h.module.setup(), /preflight rejected/);
  assert.equal(h.calls.length, 1);
});
