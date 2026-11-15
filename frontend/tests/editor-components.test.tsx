import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { EditorSurface } from '@/components/workspace/editor-surface';
import { DocumentSyncStatus } from '@/components/workspace/document-sync-status';
import { EditorTools } from '@/components/editor/tools';
import { vi } from 'vitest';
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

describe('document editing toolbar', () => {
  it('keeps assistant and formatting actions in the labeled, keyboard-operable tool group', async () => {
    const user = userEvent.setup();
    const document = new Y.Doc();
    const editor = new Editor({
      element: documentElement(),
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document }),
      ],
    });
    const openAssistant = vi.fn();
    try {
      render(
        <EditorTools
          editor={editor}
          canWrite
          onOpenAssistant={openAssistant}
          assistantBusy={false}
        />,
      );
      const tools = screen.getByRole('group', { name: 'Document tools' });
      const assistant = within(tools).getByRole('button', { name: 'AI Assistant' });
      expect(tools.contains(assistant)).toBe(true);

      await user.tab();
      expect(window.document.activeElement).toBe(
        screen.getByRole('button', { name: 'Insert block' }),
      );
      await user.keyboard('{Enter}');
      expect(screen.getByRole('menuitem', { name: 'Text' })).toBeTruthy();
      await user.keyboard('{ArrowDown}');
      expect(window.document.activeElement).toBe(
        screen.getByRole('menuitem', { name: 'Heading 1' }),
      );
      await user.keyboard('{Enter}');
      expect(editor.isActive('heading', { level: 1 })).toBe(true);

      await user.click(assistant);
      expect(openAssistant).toHaveBeenCalledOnce();
    } finally {
      editor.destroy();
      document.destroy();
    }
  });

  it('does not expose writing actions to read-only members', () => {
    const document = new Y.Doc();
    const editor = new Editor({
      element: documentElement(),
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document }),
      ],
    });
    try {
      render(
        <EditorTools
          editor={editor}
          canWrite={false}
          onOpenAssistant={vi.fn()}
          assistantBusy={false}
        />,
      );
      expect(screen.queryByRole('group', { name: 'Document tools' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'AI Assistant' })).toBeNull();
    } finally {
      editor.destroy();
      document.destroy();
    }
  });
});

it('announces pending and offline state instead of claiming unacknowledged changes are saved', () => {
  const view = render(<DocumentSyncStatus status="connected" pending canWrite />);
  expect(screen.getByRole('status').textContent).toBe('Saving…');
  view.rerender(<DocumentSyncStatus status="offline" pending canWrite />);
  expect(screen.getByRole('status').textContent).toMatch(/^Offline/);
  view.rerender(<DocumentSyncStatus status="connected" pending={false} canWrite={false} />);
  expect(screen.getByRole('status').textContent).toBe('Saved · Read only');
});

it('explains remote acknowledgements and stops claiming save progress after access denial', () => {
  const view = render(<DocumentSyncStatus status="connected" pending={false} canWrite />);
  expect(screen.getByRole('status').getAttribute('title')).toContain('server journal');
  view.rerender(<DocumentSyncStatus status="offline" pending canWrite={false} accessDenied />);
  expect(screen.getByRole('status').textContent).toBe('Access unavailable — editing stopped');
  expect(screen.getByRole('status').getAttribute('title')).toContain('not confirmed remotely');
});
