'use client';
import { useEffect } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';

/** Server-authorized editability; the backend independently rejects viewer writes. */
export function EditorSurface({ editor, canWrite }: { editor: Editor | null; canWrite: boolean }) {
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canWrite);
    const attributes = editor.options.editorProps.attributes;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(typeof attributes === 'function' ? attributes(editor.state) : attributes),
          role: 'textbox',
          'aria-label': 'Document content',
          'aria-multiline': 'true',
          'aria-readonly': String(!canWrite),
        },
      },
    });
  }, [canWrite, editor]);
  return <EditorContent editor={editor} />;
}
