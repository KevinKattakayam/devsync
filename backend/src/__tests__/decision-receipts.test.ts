import {
  plainDocument,
  receiptContentSchema,
  sourceFingerprint,
} from '../services/decision-receipts';
it('extracts only text nodes, never HTML attributes or embedded instructions as markup', () => {
  expect(
    plainDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { src: 'private' },
          content: [{ type: 'text', text: '<script>untrusted</script>' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    }),
  ).toBe('<script>untrusted</script>\nSecond');
});
it('fingerprints bind kind, identity, revision and source text', () => {
  const key = sourceFingerprint('document', 'a', '1', 'quote');
  expect(sourceFingerprint('document', 'a', '1', 'quote')).toBe(key);
  for (const args of [
    ['task', 'a', '1', 'quote'],
    ['document', 'b', '1', 'quote'],
    ['document', 'a', '2', 'quote'],
    ['document', 'a', '1', 'other'],
  ])
    expect(sourceFingerprint(args[0], args[1], args[2], args[3])).not.toBe(key);
});
it('bounds receipt fields and rejects forged workflow/authority fields', () => {
  const valid = {
    title: 'A decision',
    rationale: 'A reason',
    sourceKind: 'task',
    sourceId: 'a',
    sourceRevision: 'a'.repeat(64),
    excerpt: 'A quote',
  };
  expect(receiptContentSchema.safeParse(valid).success).toBe(true);
  for (const extra of [
    { status: 'ACCEPTED' },
    { workspaceId: 'foreign' },
    { acceptedBy: 'owner' },
    { excerpt: 'x'.repeat(5001) },
    { title: ' ' },
    { rationale: 'x'.repeat(8001) },
  ])
    expect(receiptContentSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
});
it('preserves hard breaks and nested block boundaries instead of joining separate statements', () => {
  expect(
    plainDocument({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'First' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'line' },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
            },
          ],
        },
      ],
    }),
  ).toBe('First\nline\nSecond');
});
