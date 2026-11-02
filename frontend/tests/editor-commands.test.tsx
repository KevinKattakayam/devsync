import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { blockCommands, matchingBlocks, slashAtSelection } from '../src/components/editor/commands';
function withEditor(run: (editor: Editor, document: Y.Doc) => void) {
  const document = new Y.Doc();
  const editor = new Editor({
    element: window.document.createElement('div'),
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TaskList,
      TaskItem,
      TableKit,
      Collaboration.configure({ document }),
    ],
  });
  try {
    run(editor, document);
  } finally {
    editor.destroy();
    document.destroy();
  }
}
describe('editor block commands using the existing Yjs schema', () => {
  it('recognizes only a paragraph-start slash at a collapsed selection', () =>
    withEditor((editor) => {
      editor.commands.insertContent('/heading');
      expect(slashAtSelection(editor)).toEqual({ from: 1, to: 9, query: 'heading' });
      editor.commands.setTextSelection({ from: 1, to: 4 });
      expect(slashAtSelection(editor)).toBeNull();
      editor.commands.setContent('<p>an inline /heading</p>');
      editor.commands.setTextSelection(19);
      expect(slashAtSelection(editor)).toBeNull();
      editor.commands.setContent('<pre><code>/heading</code></pre>');
      editor.commands.setTextSelection(9);
      expect(slashAtSelection(editor)).toBeNull();
    }));
  it('preserves typed text on no match and filters available commands', () =>
    withEditor((editor) => {
      editor.commands.insertContent('/unknown');
      expect(matchingBlocks('unknown')).toEqual([]);
      expect(editor.getText()).toBe('/unknown');
      expect(matchingBlocks('code').map((item) => item.id)).toEqual(['codeBlock']);
    }));
  for (const id of ['heading2', 'taskList', 'codeBlock', 'table'])
    it(`writes ${id} into the shared Yjs document`, () =>
      withEditor((editor, document) => {
        const command = blockCommands.find((item) => item.id === id);
        expect(command).toBeTruthy();
        command!.run(editor);
        expect(editor.isActive(id === 'heading2' ? 'heading' : id)).toBe(true);
        expect(document.getXmlFragment('default').toString()).toContain(
          id === 'heading2' ? 'heading' : id.toLowerCase(),
        );
        if (id === 'codeBlock') {
          editor.commands.updateAttributes('codeBlock', { language: 'typescript' });
          expect(document.getXmlFragment('default').toString()).toContain('typescript');
        }
      }));
});
