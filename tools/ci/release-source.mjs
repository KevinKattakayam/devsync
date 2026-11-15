import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** Prepare source from a specific checked-out commit. This does not attest a built image. */
export function createReviewedSourceBundle(repository, reviewedSha) {
  if (typeof reviewedSha !== 'string' || !/^[a-f0-9]{40}$/.test(reviewedSha))
    throw new Error('invalid reviewed commit');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  const options = {
    cwd: repository,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 128 * 1024 * 1024,
  };
  let head;
  try {
    head = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      ...options,
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error('reviewed commit verification failed');
  }
  if (head !== reviewedSha) throw new Error('reviewed commit mismatch');
  let archive;
  try {
    const entries = execFileSync('git', ['ls-tree', '-rz', '--full-tree', reviewedSha], options)
      .toString('utf8')
      .split('\0');
    if (entries.some((entry) => entry.startsWith('160000 ')))
      throw new Error('unsupported source submodule');
    archive = execFileSync('git', ['archive', '--format=tar', reviewedSha], options);
  } catch {
    throw new Error('reviewed source archive failed');
  }
  return {
    commit: reviewedSha,
    sha256: createHash('sha256').update(archive).digest('hex'),
    archive,
  };
}
