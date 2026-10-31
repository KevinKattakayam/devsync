'use client';
import { useEffect } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';

/** Server-authorized editability; the backend independently rejects viewer writes. */
export function EditorSurface({ editor, canWrite }: { editor: Editor | null; canWrite: boolean }) {
  useEffect(() => { editor?.setEditable(canWrite); }, [canWrite, editor]);
  return <div aria-label="Document content" aria-readonly={!canWrite}><EditorContent editor={editor} /></div>;
}
