import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createReviewedSourceBundle } from '../release-source.mjs';

function git(repo, ...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
test('bundles exactly the reviewed commit even when the working tree changes', () => {
  const repo = mkdtempSync(join(tmpdir(), 'devsync-release-test-'));
  try {
    git(repo, 'init', '-q');
    writeFileSync(join(repo, 'content.txt'), 'committed content');
    git(repo, 'add', 'content.txt');
    git(
      repo,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    );
    const sha = git(repo, 'rev-parse', 'HEAD');
    const a = createReviewedSourceBundle(repo, sha);
    writeFileSync(join(repo, 'content.txt'), 'uncommitted content');
    writeFileSync(join(repo, 'untracked.txt'), 'untracked content');
    const b = createReviewedSourceBundle(repo, sha);
    assert.equal(a.commit, sha);
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert.equal(a.sha256, b.sha256);
    assert.deepEqual(a.archive, b.archive);
    assert.equal(
      execFileSync('tar', ['-xOf', '-', 'content.txt'], { input: b.archive, encoding: 'utf8' }),
      'committed content',
    );
    assert.throws(
      () => createReviewedSourceBundle(repo, 'a'.repeat(40)),
      /reviewed commit mismatch/,
    );
    assert.throws(() => createReviewedSourceBundle(repo, 'HEAD'), /invalid reviewed commit/);
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${sha},nested`);
    git(
      repo,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'gitlink',
    );
    assert.throws(
      () => createReviewedSourceBundle(repo, git(repo, 'rev-parse', 'HEAD')),
      /reviewed source archive failed/,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
