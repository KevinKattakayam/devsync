'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Undo2,
  Redo2,
  Plus,
  ChevronDown,
  Copy,
} from 'lucide-react';
import { Button, IconButton, DropdownMenu, Select, toast } from '@/components/ui';
import { blockCommands, matchingBlocks, slashAtSelection } from './commands';

export function EditorTools({ editor, canWrite }: { editor: Editor; canWrite: boolean }) {
  const listId = useId();
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const anchor = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      slash: slashAtSelection(editor),
      selected:
        !editor.state.selection.empty &&
        !!editor.state.doc
          .textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
          .trim(),
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      codeBlock: editor.isActive('codeBlock'),
      table: editor.isActive('table'),
      language: String(editor.getAttributes('codeBlock').language || 'plain'),
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    }),
  });
  const signature = state.slash ? `${state.slash.from}:${state.slash.query}` : '';
  const slash = canWrite && state.slash && signature !== dismissed ? state.slash : null;
  const options = matchingBlocks(slash?.query || '');
  const current = Math.min(active, Math.max(0, options.length - 1));
  const choose = (index: number) => {
    if (!slash || !canWrite || !editor.isEditable || !options[index]) return;
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
    options[index].run(editor);
    setActive(0);
  };
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || !slash) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(signature);
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActive((value) =>
          options.length
            ? (value + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
            : 0,
        );
      }
      if (event.key === 'Enter' && options.length) {
        event.preventDefault();
        event.stopPropagation();
        choose(current);
      }
    };
    dom.addEventListener('keydown', onKey, true);
    if (slash) {
      dom.setAttribute('aria-controls', listId);
      dom.setAttribute('aria-activedescendant', `${listId}-${current}`);
    }
    return () => {
      dom.removeEventListener('keydown', onKey, true);
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  });
  const floating = !!slash || state.selected;
  const floatingHeight = slash ? 320 : 48;
  useEffect(() => {
    const update = () => {
      if (!anchor.current || !floating) return;
      const rect = editor.view.coordsAtPos(state.from);
      const parent = anchor.current.getBoundingClientRect();
      setPosition({
        left: Math.max(0, Math.min(rect.left - parent.left, parent.width - 280)),
        top: Math.max(
          0,
          (rect.bottom + floatingHeight > window.innerHeight
            ? rect.top - floatingHeight - 8
            : rect.bottom + 8) - parent.top,
        ),
      });
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [editor, floating, floatingHeight, state.from, state.to]);
  const format = (
    <div role="group" aria-label="Text formatting" className="flex flex-wrap gap-1">
      {[
        {
          label: 'Bold',
          icon: Bold,
          active: state.bold,
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: 'Italic',
          icon: Italic,
          active: state.italic,
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: 'Strikethrough',
          icon: Strikethrough,
          active: state.strike,
          run: () => editor.chain().focus().toggleStrike().run(),
        },
        {
          label: 'Inline code',
          icon: Code,
          active: state.code,
          run: () => editor.chain().focus().toggleCode().run(),
        },
      ].map((item) => (
        <IconButton
          key={item.label}
          label={item.label}
          title={item.label}
          aria-pressed={item.active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (canWrite && editor.isEditable) item.run();
          }}
        >
          <item.icon className="size-4" />
        </IconButton>
      ))}
    </div>
  );
  return (
    <div ref={anchor} className="relative min-w-0" data-editor-tools>
      {canWrite && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-2"
          aria-label="Document tools"
        >
          <DropdownMenu
            label="Insert block"
            trigger={
              <Button variant="ghost" aria-label="Insert block">
                <Plus className="size-4" aria-hidden="true" />
                Insert
                <ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            }
            items={blockCommands.map((item) => ({
              id: item.id,
              label: item.label,
              onSelect: () => {
                if (editor.isEditable) item.run(editor);
              },
            }))}
          />
          <details className="relative">
            <summary className="cursor-pointer rounded-md px-3 py-2 text-sm">Formatting</summary>
            <div className="ui-floating absolute right-0 z-20 p-1">{format}</div>
          </details>
          <div className="ml-auto flex gap-1">
            <IconButton
              label="Undo document change"
              title="Undo"
              disabled={!state.undo}
              onClick={() => {
                if (editor.isEditable) editor.chain().focus().undo().run();
              }}
            >
              <Undo2 className="size-4" />
            </IconButton>
            <IconButton
              label="Redo document change"
              title="Redo"
              disabled={!state.redo}
              onClick={() => {
                if (editor.isEditable) editor.chain().focus().redo().run();
              }}
            >
              <Redo2 className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
      {state.codeBlock && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-secondary p-3"
          role="group"
          aria-label="Code block controls"
        >
          {canWrite ? (
            <div className="w-44">
              <Select
                label="Code language"
                value={state.language}
                options={Array.from(
                  new Set([
                    'plain',
                    'javascript',
                    'typescript',
                    'python',
                    'html',
                    'css',
                    'json',
                    'bash',
                    'sql',
                    state.language,
                  ]),
                ).map((value) => ({ value, label: value === 'plain' ? 'Plain text' : value }))}
                onValueChange={(language) => {
                  if (editor.isEditable)
                    editor
                      .chain()
                      .focus()
                      .updateAttributes('codeBlock', {
                        language: language === 'plain' ? null : language,
                      })
                      .run();
                }}
              />
            </div>
          ) : (
            <span className="text-sm">{state.language}</span>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              const node = editor.state.selection.$from.parent;
              if (node.type.name !== 'codeBlock') return;
              void navigator.clipboard
                .writeText(node.textContent)
                .then(() => toast.success('Code copied'))
                .catch(() => toast.error('Copy failed. Select the code and copy it manually.'));
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            Copy code
          </Button>
          <span className="text-xs text-muted-foreground">Plain code · no execution</span>
        </div>
      )}
      {state.table && canWrite && (
        <div role="group" aria-label="Table controls" className="mb-4 flex flex-wrap gap-2">
          {[
            { label: 'Add row', run: () => editor.chain().focus().addRowAfter().run() },
            { label: 'Add column', run: () => editor.chain().focus().addColumnAfter().run() },
            { label: 'Remove row', run: () => editor.chain().focus().deleteRow().run() },
            { label: 'Remove column', run: () => editor.chain().focus().deleteColumn().run() },
            { label: 'Remove table', run: () => editor.chain().focus().deleteTable().run() },
          ].map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              size="compact"
              onClick={() => {
                if (editor.isEditable) item.run();
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      {canWrite && state.selected && !slash && (
        <div
          className="ui-floating absolute z-20 max-w-full p-1"
          style={position}
          aria-label="Selection formatting"
        >
          {format}
        </div>
      )}
      {slash && (
        <div className="ui-floating absolute z-30 w-[280px] max-w-full p-1" style={position}>
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Insert block · ↑ ↓ Enter · Esc closes
          </p>
          {options.length ? (
            <div
              role="listbox"
              aria-label="Slash commands"
              id={listId}
              className="max-h-64 overflow-y-auto"
            >
              {options.map((item, index) => (
                <div
                  key={item.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(index)}
                  className="ui-command-option flex-col items-start"
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <p role="status" className="p-3 text-sm">
              No blocks match. Escape keeps your text.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
