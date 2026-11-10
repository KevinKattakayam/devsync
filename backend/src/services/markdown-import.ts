import { BadRequestError } from '../utils/errors';

/** Validate decoded Markdown before any conversion or database mutation. */
export function validateMarkdownImport(markdown: string): string {
  if (
    Buffer.byteLength(markdown, 'utf8') > 256 * 1024 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(markdown) ||
    Buffer.from(markdown, 'utf8').toString('utf8') !== markdown
  )
    throw new BadRequestError('Invalid or oversized Markdown');
  return markdown;
}

/** Restricted subset: single-line paragraphs and ATX headings, separated by blank lines. */
export function markdownToDocument(input: string) {
  const source = validateMarkdownImport(input).replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (source.includes('\r')) throw new BadRequestError('Unsupported Markdown line ending');
  const blocks = source.split(/\n{2,}/);
  const content = blocks
    .filter((block) => block.length > 0)
    .map((block) => {
      if (block.includes('\n') || /^[ \t]/.test(block) || /[ \t]$/.test(block))
        throw new BadRequestError('Unsupported Markdown block');
      const heading = /^(#{1,6}) (.+)$/.exec(block);
      const text = heading ? heading[2] : block;
      // Reject Markdown and HTML metacharacters instead of silently flattening formatting.
      if (/[\\`*_[\]<>!~|&#]/.test(text) || /^(?:[-+>] |\d+[.)] |-{3,}$)/.test(text))
        throw new BadRequestError('Unsupported Markdown formatting');
      return heading
        ? {
            type: 'heading',
            attrs: { level: heading[1].length },
            content: [{ type: 'text', text }],
          }
        : { type: 'paragraph', content: [{ type: 'text', text }] };
    });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
