import type { Editor } from '@tiptap/react';
export const blockCommands = [
  {
    id: 'paragraph',
    label: 'Text',
    detail: 'A plain paragraph',
    run: (e: Editor) => e.chain().focus().setParagraph().run(),
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    detail: 'Large section heading',
    run: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    detail: 'Section heading',
    run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    detail: 'Small section heading',
    run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bulletList',
    label: 'Bullet list',
    detail: 'Unordered items',
    run: (e: Editor) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    detail: 'Ordered items',
    run: (e: Editor) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    label: 'Task list',
    detail: 'Checkable items',
    run: (e: Editor) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    detail: 'A block quotation',
    run: (e: Editor) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    detail: 'Code with language and copy controls',
    run: (e: Editor) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'table',
    label: 'Table',
    detail: 'Three columns with a header',
    run: (e: Editor) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'horizontalRule',
    label: 'Divider',
    detail: 'Separate sections',
    run: (e: Editor) => e.chain().focus().setHorizontalRule().run(),
  },
];
export function slashAtSelection(editor: Editor) {
  const { empty, from, $from } = editor.state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph') return null;
  const text = $from.parent.textBetween(0, $from.parentOffset, '');
  const match = /^\/([a-z0-9 ]*)$/i.exec(text);
  if (!match) return null;
  return { from: from - $from.parentOffset, to: from, query: match[1].toLowerCase() };
}
export function matchingBlocks(query: string) {
  return blockCommands.filter((item) =>
    `${item.label} ${item.detail}`.toLowerCase().includes(query),
  );
}
