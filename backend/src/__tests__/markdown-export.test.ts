import { documentToMarkdown } from '../services/markdown-export';
import { markdownToDocument } from '../services/markdown-import';

describe('restricted Markdown export', () => {
  it('round trips the supported imported content', () => {
    const input = '# Title\n\nPlain text.';
    expect(documentToMarkdown(markdownToDocument(input))).toBe(input);
  });
  it('rejects marks, embedded HTML, unsupported nodes and extra empty paragraphs', () => {
    for (const input of [
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
          },
        ],
      },
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>' }] }],
      },
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.test/a' } }] },
      { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }] },
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '# Heading' }] }],
      },
    ])
      expect(() => documentToMarkdown(input)).toThrow();
  });
});
