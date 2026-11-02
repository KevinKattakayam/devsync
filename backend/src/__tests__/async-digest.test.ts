import {
  decodeDigestCursor,
  encodeDigestCursor,
  digestSource,
  digestPreferenceWrite,
  digestAckSchema,
} from '../services/async-digest';
it('records only stable typed source IDs and revisions, without content copies', () => {
  const source = digestSource('document', 'source-id', '0');
  expect(source).toEqual({
    digestSource: { version: 1, kind: 'document', id: 'source-id', revision: '0' },
  });
  expect(() => digestSource('document', '', '0')).toThrow();
});
it('round trips bounded scope-bound cursors and rejects malformed values', () => {
  const key = {
    workspaceId: 'workspace',
    userId: 'actor',
    revision: 1,
    until: '2026-11-02T00:00:00.000Z',
    afterAt: '2026-11-01T00:00:00.000Z',
    afterId: 'event',
  };
  expect(decodeDigestCursor(encodeDigestCursor(key))).toEqual(key);
  for (const input of ['x'.repeat(2049), '%%%', 'e30'])
    expect(() => decodeDigestCursor(input)).toThrow('Invalid digest cursor');
});
it('rejects forged recipient/tenant fields and missing explicit acknowledgment targets', () => {
  expect(
    digestPreferenceWrite.safeParse({ enabled: true, expectedRevision: 0, userId: 'foreign' })
      .success,
  ).toBe(false);
  expect(digestAckSchema.safeParse({ activityId: '', expectedRevision: 0 }).success).toBe(false);
  expect(
    digestAckSchema.safeParse({ activityId: 'event', expectedRevision: 0, workspaceId: 'foreign' })
      .success,
  ).toBe(false);
});
