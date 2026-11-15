import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const configuration = ts.transpileModule(read('../next.config.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const evaluate = (env) => runInNewContext(configuration, { exports: {}, process: { env }, URL });

test('real production config still rejects each missing input and insecure transport', () => {
  const valid = {
    DEPLOYMENT_MODE: 'production',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-public-contract-value',
    NEXT_PUBLIC_API_URL: 'https://configuration-test.invalid/api/v1',
    NEXT_PUBLIC_SOCKET_URL: 'https://configuration-test.invalid',
    NEXT_PUBLIC_YJS_URL: 'wss://configuration-test.invalid',
    BACKEND_URL: 'https://configuration-test.invalid',
  };
  for (const name of Object.keys(valid).filter((name) => name !== 'DEPLOYMENT_MODE')) {
    const env = { ...valid };
    delete env[name];
    assert.throws(() => evaluate(env), new RegExp(`Missing deployment setting: ${name}`));
  }
  for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SOCKET_URL', 'BACKEND_URL'])
    assert.throws(
      () => evaluate({ ...valid, [name]: 'http://configuration-test.invalid' }),
      /HTTPS required/,
    );
  assert.throws(
    () => evaluate({ ...valid, NEXT_PUBLIC_YJS_URL: 'ws://configuration-test.invalid' }),
    /WSS required/,
  );
});

test('CI compilation uses an independent no-credential stage and cannot be the default image', () => {
  const docker = read('../Dockerfile');
  const stage = docker
    .split('FROM dependencies AS ci-build')[1]
    .split('FROM base AS runtime-base')[0];
  assert.match(stage, /DEPLOYMENT_MODE=local NODE_ENV=production/);
  assert.doesNotMatch(stage, /ARG |pk_|https?:\/\/|wss?:\/\//);
  assert.match(read('../.dockerignore'), /\*\*\/\.env\*/);
  assert.match(docker, /LABEL org.devsync.image-purpose="ci-scan-only-not-deployable"/);
  const ciRunner = docker
    .split('FROM runtime-base AS ci-runner')[1]
    .split('FROM runtime-base AS runner')[0];
  assert.match(ciRunner, /ENTRYPOINT \["node", "ci-refuse-start.mjs"\]/);
  assert.equal([...docker.matchAll(/^FROM .* AS (.+)$/gm)].at(-1)[1], 'runner');
  assert.doesNotThrow(() => evaluate({ DEPLOYMENT_MODE: 'local' }));
});

test('scan-only startup always refuses traffic, even with production environment overrides', () => {
  const process = { env: { DEPLOYMENT_MODE: 'production' }, exitCode: 0 };
  const messages = [];
  runInNewContext(read('../docker/ci-refuse-start.mjs'), {
    process,
    console: { error: (message) => messages.push(message) },
  });
  assert.equal(process.exitCode, 1);
  assert.match(messages[0], /cannot serve traffic/);
});

test('CI frontend cannot reach publish/provenance steps and retains mandatory scans and SBOM', () => {
  const workflow = read('../../.github/workflows/main.yml');
  assert.match(
    workflow,
    /artifact: frontend-ci-scan-only\s+target: ci-runner\s+image: devsync-web-ci-scan-only/,
  );
  for (const name of [
    'Publish exactly the scanned image after all gates',
    'Preserve build provenance',
  ]) {
    const step = workflow.split(`- name: ${name}`)[1].split('\n      - ')[0];
    assert.match(step, /if: github.event_name == 'push' && matrix.target != 'ci-runner'/);
  }
  assert.match(workflow, /--exit-code 1 --severity HIGH,CRITICAL/);
  assert.match(workflow, /--format cyclonedx/);
  assert.match(workflow, /push: false/);
});
