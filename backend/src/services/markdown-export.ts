import { z } from 'zod';
import { BadRequestError } from '../utils/errors';
import { markdownToDocument } from './markdown-import';

const text = z.object({ type: z.literal('text'), text: z.string().min(1) }).strict();
const paragraph = z
  .object({ type: z.literal('paragraph'), content: z.array(text).optional() })
  .strict();
const heading = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.number().int().min(1).max(6) }).strict(),
    content: z.array(text).min(1),
  })
  .strict();
const document = z
  .object({ type: z.literal('doc'), content: z.array(z.union([paragraph, heading])).min(1) })
  .strict();

/** Export only structures the restricted importer can reconstruct without losing content. */
export function documentToMarkdown(input: unknown): string {
  const parsed = document.safeParse(input);
  if (!parsed.success)
    throw new BadRequestError('Document contains unsupported Markdown formatting');
  if (
    parsed.data.content.length === 1 &&
    parsed.data.content[0].type === 'paragraph' &&
    !parsed.data.content[0].content?.length
  )
    return '';
  const markdown = parsed.data.content
    .map((block) => {
      if (!block.content?.length)
        throw new BadRequestError('Document contains unsupported empty blocks');
      const body = block.content.map((part) => part.text).join('');
      return block.type === 'heading' ? `${'#'.repeat(block.attrs.level)} ${body}` : body;
    })
    .join('\n\n');
  // Reuse import validation; fail rather than omit or reinterpret unsupported syntax.
  const reconstructed = markdownToDocument(markdown);
  const normalized = (blocks: typeof parsed.data.content) =>
    blocks.map((block) => ({
      type: block.type,
      level: block.type === 'heading' ? block.attrs.level : null,
      text: block.content?.map((part) => part.text).join('') ?? '',
    }));
  const after = document.safeParse(reconstructed);
  if (
    !after.success ||
    JSON.stringify(normalized(after.data.content)) !==
      JSON.stringify(normalized(parsed.data.content))
  )
    throw new BadRequestError('Document cannot be represented without changing its meaning');
  return markdown;
}
