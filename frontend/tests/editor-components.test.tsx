import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { EditorSurface } from '@/components/workspace/editor-surface';
import { DocumentSyncStatus } from '@/components/workspace/document-sync-status';
afterEach(cleanup);

describe('document editor surface with real TipTap and Yjs', () => {
  it('writes through the collaboration extension and applies server-authorized read-only changes', () => {
    const document = new Y.Doc();
    const editor = new Editor({
      element: documentElement(),
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document }),
      ],
    });
    try {
      const view = render(<EditorSurface editor={editor} canWrite />);
      editor.commands.insertContent('Concurrent paragraph');
      expect(document.getXmlFragment('default').toString()).toContain('Concurrent paragraph');
      expect(editor.isEditable).toBe(true);
      view.rerender(<EditorSurface editor={editor} canWrite={false} />);
      expect(editor.isEditable).toBe(false);
      expect(screen.getByLabelText('Document content').getAttribute('aria-readonly')).toBe('true');
      view.unmount();
    } finally {
      editor.destroy();
      document.destroy();
    }
  });
});
function documentElement() {
  return window.document.createElement('div');
}

it('announces pending and offline state instead of claiming unacknowledged changes are saved', () => {
  const view = render(<DocumentSyncStatus status="connected" pending canWrite />);
  expect(screen.getByRole('status').textContent).toBe('Saving…');
  view.rerender(<DocumentSyncStatus status="offline" pending canWrite />);
  expect(screen.getByRole('status').textContent).toMatch(/^Offline/);
  view.rerender(<DocumentSyncStatus status="connected" pending={false} canWrite={false} />);
  expect(screen.getByRole('status').textContent).toBe('Saved · Read only');
});
