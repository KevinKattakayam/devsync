import { validateMarkdownImport } from '../services/markdown-import';

describe('Markdown import validation', () => {
  it('accepts UTF-8 Markdown and preserves its content', () => {
    expect(validateMarkdownImport('# Hello\n\nText 🌍')).toBe('# Hello\n\nText 🌍');
  });
  it('rejects binary controls and unpaired surrogates', () => {
    expect(() => validateMarkdownImport('text\u0000binary')).toThrow();
    expect(() => validateMarkdownImport('\ud800')).toThrow();
  });
  it('enforces the byte bound rather than character count', () => {
    expect(() => validateMarkdownImport('🌍'.repeat(65537))).toThrow();
  });
});

describe('restricted Markdown conversion', () => {
  it('converts headings and paragraphs without treating raw text as HTML', () => {
    const { markdownToDocument } =
      require('../services/markdown-import') as typeof import('../services/markdown-import');
    expect(markdownToDocument('# Title\n\nPlain text.')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Plain text.' }] },
      ],
    });
  });
  it.each([
    '<script>alert(1)</script>',
    '**bold**',
    '[link](javascript:alert(1))',
    '- item',
    '```js\ncode\n```',
  ])('rejects unsupported or unsafe syntax: %s', (input) => {
    const { markdownToDocument } =
      require('../services/markdown-import') as typeof import('../services/markdown-import');
    expect(() => markdownToDocument(input)).toThrow();
  });
});
