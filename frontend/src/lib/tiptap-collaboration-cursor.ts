import { Extension } from '@tiptap/core';
import { yCursorPlugin, defaultSelectionBuilder } from '@tiptap/y-tiptap';

export interface CollaborationCursorOptions {
  provider: any;
  user: {
    name: string;
    color: string;
  };
  render?: (user: { name: string; color: string }) => HTMLElement;
}

export const CollaborationCursor = Extension.create<CollaborationCursorOptions>({
  name: 'collaborationCursor',

  addOptions() {
    return {
      provider: null,
      user: {
        name: 'Anonymous',
        color: '#6366f1',
      },
      render: (user: { name: string; color: string }) => {
        const cursor = document.createElement('span');
        cursor.classList.add('collaboration-cursor__caret');
        cursor.setAttribute('style', `border-color: ${user.color}`);

        const label = document.createElement('div');
        label.classList.add('collaboration-cursor__label');
        label.setAttribute('style', `background-color: ${user.color}`);
        label.insertBefore(document.createTextNode(user.name), null);

        cursor.insertBefore(label, null);
        return cursor;
      },
    };
  },

  addProseMirrorPlugins() {
    if (!this.options.provider?.awareness) {
      return [];
    }

    const awareness = this.options.provider.awareness;
    awareness.setLocalStateField('user', this.options.user);

    return [
      yCursorPlugin(awareness, {
        cursorBuilder: (user: any) => this.options.render!(user),
        selectionBuilder: defaultSelectionBuilder,
      }),
    ];
  },
});
