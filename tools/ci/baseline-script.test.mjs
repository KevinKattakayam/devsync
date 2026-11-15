import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const metricNames = ['statements', 'branches', 'functions', 'lines'];

function coverageSummary(percent) {
  return {
    total: Object.fromEntries(metricNames.map((metric) => [metric, { pct: percent }])),
  };
}

async function createCoverageRepository({
  basePercent = 80,
  currentPercent = 81,
  hasBaseFile = true,
}) {
  const directory = await mkdtemp(join(tmpdir(), 'devsync-coverage-baseline-'));
  execFileSync('git', ['init', '--quiet'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'coverage-test@example.invalid'], {
    cwd: directory,
  });
  execFileSync('git', ['config', 'user.name', 'Coverage Test'], { cwd: directory });

  await mkdir(join(directory, 'tools/ci'), { recursive: true });
  await copyFile(
    join(repositoryRoot, 'tools/ci/baseline.sh'),
    join(directory, 'tools/ci/baseline.sh'),
  );
  await copyFile(
    join(repositoryRoot, 'tools/ci/coverage.mjs'),
    join(directory, 'tools/ci/coverage.mjs'),
  );
  if (hasBaseFile) {
    await writeFile(
      join(directory, 'tools/ci/coverage-baseline.json'),
      JSON.stringify({ backend: coverageSummary(basePercent) }),
    );
  }
  execFileSync('git', ['add', 'tools/ci/baseline.sh', 'tools/ci/coverage.mjs'], { cwd: directory });
  if (hasBaseFile) {
    execFileSync('git', ['add', 'tools/ci/coverage-baseline.json'], { cwd: directory });
  }
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture baseline'], { cwd: directory });
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: directory,
    encoding: 'utf8',
  }).trim();

  await mkdir(join(directory, 'coverage/backend'), { recursive: true });
  await writeFile(
    join(directory, 'coverage/backend/coverage-summary.json'),
    JSON.stringify(coverageSummary(currentPercent)),
  );
  const fakeBin = join(directory, 'fake-bin');
  await mkdir(fakeBin);
  const ghPath = join(fakeBin, 'gh');
  await writeFile(ghPath, '#!/bin/sh\n[ "$1" = api ] && exit 0\nexit 64\n');
  await chmod(ghPath, 0o755);

  return { directory, baseSha, fakeBin };
}

async function runBaseline(fixture) {
  return spawnSync('bash', ['tools/ci/baseline.sh', 'backend'], {
    cwd: fixture.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_SHA: fixture.baseSha,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REPOSITORY: 'example/devsync',
      PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
    },
  });
}

test('coverage bootstrap compares against the base commit baseline, not the PR working copy', async (t) => {
  const fixture = await createCoverageRepository({ basePercent: 80, currentPercent: 81 });
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  await writeFile(
    join(fixture.directory, 'tools/ci/coverage-baseline.json'),
    JSON.stringify({ backend: coverageSummary(99) }),
  );

  const result = await runBaseline(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /measured baseline from the base commit/);
  assert.match(result.stdout, /"status": "passed"/);
});

test('coverage bootstrap rejects any metric below the base commit baseline', async (t) => {
  const fixture = await createCoverageRepository({ basePercent: 80, currentPercent: 79.99 });
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  const result = await runBaseline(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Coverage decreased/);
});

test('coverage bootstrap fails closed when neither an artifact nor base baseline exists', async (t) => {
  const fixture = await createCoverageRepository({ hasBaseFile: false });
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  await writeFile(
    join(fixture.directory, 'tools/ci/coverage-baseline.json'),
    JSON.stringify({ backend: coverageSummary(1) }),
  );

  const result = await runBaseline(fixture);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /No successful base-commit coverage artifact or base-commit measured baseline/,
  );
});
