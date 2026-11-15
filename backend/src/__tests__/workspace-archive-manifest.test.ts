import { buildWorkspaceArchiveManifest } from '../services/workspace-archive-manifest';

test('uses fixed generated paths and content hashes', () => {
  const result = buildWorkspaceArchiveManifest(
    [{ content: Buffer.from('Hello') }],
    Buffer.from('csv'),
  );
  expect(result.files.map((file) => file.path)).toEqual(['documents/000001.md', 'tasks/tasks.csv']);
  expect(result.files[0].sha256).toBe(
    '185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969',
  );
  expect(result.scope).toBe('workspace');
  expect(result.label).toContain('not a complete account backup');
  expect(result.privacy).toContain('no content redaction');
});
test('rejects too many or oversized entries', () => {
  expect(() =>
    buildWorkspaceArchiveManifest(Array(101).fill({ content: Buffer.alloc(0) }), Buffer.alloc(0)),
  ).toThrow();
  expect(() =>
    buildWorkspaceArchiveManifest([{ content: Buffer.alloc(256 * 1024 + 1) }], Buffer.alloc(0)),
  ).toThrow();
  expect(() => buildWorkspaceArchiveManifest([], Buffer.alloc(1024 * 1024 + 1))).toThrow();
});
