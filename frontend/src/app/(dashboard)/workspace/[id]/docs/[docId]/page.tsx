'use client';

import { errorMessage } from '@/lib/errors';

import type { ReactNode } from 'react';
import type { Doc } from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { documentApi, aiApi } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { Document } from '@/types';
import { useEditor } from '@tiptap/react';
import { EditorSurface } from '@/components/workspace/editor-surface';
import { DocumentSyncStatus } from '@/components/workspace/document-sync-status';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCursor } from '@/lib/tiptap-collaboration-cursor';
import { useLocalFirstYDoc } from '@/lib/local-first-yjs';
import { useCRDTGarbageCollector } from '@/hooks/use-crdt-garbage-collector';
import { markdownToHtml } from '@/lib/markdown';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Undo,
  Redo,
  Sparkles,
  Loader2,
  CheckSquare,
  Users,
  CornerDownLeft,
  RefreshCw,
  Copy,
  Trash2,
  Send,
  History,
  Clock,
  RotateCcw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Collaboration cursor colors ──────────────────────────────

const CURSOR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6d28d9',
];

function getCursorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

interface EditorInnerProps {
  canWrite: boolean;
  ydoc: Doc;
  provider: HocuspocusProvider | null;
  userName: string;
  cursorColor: string;
  workspaceId: string;
  onAiSources: (sources: { type: string; title: string; score: number }[]) => void;
}

const ToolBtn = ({
  onClick,
  active,
  children,
  title: t,
}: {
  onClick: () => unknown;
  active?: boolean;
  children: ReactNode;
  title: string;
}) => (
  <button
    onMouseDown={(e) => e.preventDefault()} // Prevent stealing focus / selection from editor
    onClick={onClick}
    title={t}
    className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
  >
    {children}
  </button>
);

function EditorInner({
  canWrite,
  ydoc,
  provider,
  userName,
  cursorColor,
  workspaceId,
  onAiSources,
}: EditorInnerProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [aiStreamingText, setAiStreamingText] = useState<string>('');
  const [aiActionName, setAiActionName] = useState<string>('');
  const [selectedTextRange, setSelectedTextRange] = useState<{
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<number>(0);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ undoRedo: false, link: false }),
      Placeholder.configure({ placeholder: 'Start writing... Press / for AI commands' }),
      Highlight,
      Image,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: false }),
      Collaboration.configure({ document: ydoc }),
      ...(provider
        ? [
            CollaborationCursor.configure({
              provider,
              user: { name: userName, color: cursorColor },
            }),
          ]
        : []),
    ],
    [ydoc, provider, userName, cursorColor],
  );

  const editor = useEditor({
    editable: canWrite,
    immediatelyRender: false,
    extensions,
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px]' },
      handleKeyDown: (_view, event) => {
        if (event.key === '/' && !event.shiftKey) {
          setTimeout(() => setShowAiMenu(true), 100);
        }
        return false;
      },
    },
  });

  // Track selection live so clicking toolbar buttons never loses the highlighted range
  useEffect(() => {
    if (!editor) return;
    const handleSelectionChange = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const text = editor.state.doc.textBetween(from, to, ' ').trim();
        if (text.length > 0) {
          setSelectedTextRange({ from, to, text });
        }
      }
    };
    editor.on('selectionUpdate', handleSelectionChange);
    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor]);

  // Legacy JSON is initialized once by the server under the document row lock.
  // Loading it here creates duplicate paragraphs when two clients arrive together.

  const handleAiAction = async (action: string, label: string, promptOverride?: string) => {
    setShowAiMenu(false);
    if (!editor || !canWrite) return;

    // Check if the user had selected text
    const currentSelection = editor.state.selection;
    let activeRange = selectedTextRange;
    if (currentSelection.from !== currentSelection.to) {
      const txt = editor.state.doc
        .textBetween(currentSelection.from, currentSelection.to, ' ')
        .trim();
      if (txt.length > 0) {
        activeRange = { from: currentSelection.from, to: currentSelection.to, text: txt };
        setSelectedTextRange(activeRange);
      }
    }

    const isTargetingSelection = activeRange && activeRange.text.length > 0;
    const prompt =
      promptOverride ||
      (isTargetingSelection
        ? activeRange!.text
        : editor.getText().slice(0, 1000) ||
          (action === 'generate_code'
            ? 'Write a clean TypeScript utility function'
            : 'Write something interesting'));
    const context = isTargetingSelection
      ? `Selected text to edit: "${activeRange!.text}"`
      : editor.getText().slice(0, 1000);

    setAiLoading(true);
    setAiActionName(label);
    setAiStreamingText('');
    setCustomPrompt('');
    onAiSources([]);

    try {
      const response = await aiApi.complete({ prompt, context, action, workspaceId });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l: string) => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.sources) onAiSources(parsed.sources);
            if (parsed.content) {
              accumulated += parsed.content;
              setAiStreamingText(accumulated);
            }
          } catch {}
        }
      }
    } catch (error: unknown) {
      const message = errorMessage(error, 'AI request failed');
      toast.error(message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleInsertBelow = () => {
    if (!editor || !canWrite || !aiStreamingText) return;
    const html = markdownToHtml(aiStreamingText);
    editor.chain().focus().insertContent(html).run();
    setAiStreamingText('');
    setSelectedTextRange(null);
    toast.success('Inserted AI content into document');
  };

  const handleReplaceSelection = () => {
    if (!editor || !canWrite || !aiStreamingText) return;
    const html = markdownToHtml(aiStreamingText);
    if (selectedTextRange) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: selectedTextRange.from, to: selectedTextRange.to })
        .deleteSelection()
        .insertContent(html)
        .run();
    } else {
      editor.chain().focus().deleteSelection().insertContent(html).run();
    }
    setAiStreamingText('');
    setSelectedTextRange(null);
    toast.success('Replaced selection with AI content');
  };

  const handleCopyAi = () => {
    if (!aiStreamingText) return;
    navigator.clipboard.writeText(aiStreamingText);
    toast.success('Copied AI response to clipboard');
  };

  return (
    <>
      {/* Toolbar */}
      {editor && canWrite && (
        <div className="glass-card px-2 py-1.5 mb-4 flex items-center gap-0.5 flex-wrap sticky top-0 z-10">
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Strike"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive('code')}
            title="Code"
          >
            <Code className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="H1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="H2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="H3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Ordered List"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive('taskList')}
            title="Task List"
          >
            <CheckSquare className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo className="w-4 h-4" />
          </ToolBtn>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                showHistory
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/[0.04] text-muted-foreground hover:text-foreground border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <History className="w-3.5 h-3.5" /> History
            </button>

            <div className="relative">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowAiMenu(!showAiMenu)}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}{' '}
                AI Assistant
              </button>
              {showAiMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAiMenu(false)} />
                  <div className="absolute right-0 top-10 w-72 bg-slate-950/95 border border-white/10 rounded-2xl shadow-2xl p-2.5 z-50 backdrop-blur-xl animate-scale-in">
                    {selectedTextRange && (
                      <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-primary flex items-center justify-between">
                        <span className="truncate">
                          Selected: &ldquo;{selectedTextRange.text.slice(0, 24)}...&rdquo;
                        </span>
                        <button
                          onClick={() => setSelectedTextRange(null)}
                          className="text-[10px] underline ml-1 hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* Custom Prompt Input */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (customPrompt.trim()) {
                          handleAiAction('custom', 'Custom Prompt', customPrompt.trim());
                        }
                      }}
                      className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/10 mb-2 focus-within:border-primary/50 transition-all"
                    >
                      <input
                        type="text"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="Ask AI anything or write prompt..."
                        className="w-full bg-transparent px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!customPrompt.trim()}
                        className="p-1.5 rounded-lg gradient-primary text-white disabled:opacity-40 hover:opacity-90 transition-all"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </form>

                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 py-1">
                      Quick Actions
                    </p>
                    <div className="space-y-0.5">
                      {[
                        { action: 'continue', label: '✍️ Continue writing' },
                        {
                          action: 'improve',
                          label: selectedTextRange ? '✨ Improve selection' : '✨ Improve text',
                        },
                        {
                          action: 'summarize',
                          label: selectedTextRange
                            ? '📝 Summarize selection'
                            : '📝 Summarize document',
                        },
                        {
                          action: 'fix_grammar',
                          label: selectedTextRange ? '🔤 Fix selection grammar' : '🔤 Fix grammar',
                        },
                        {
                          action: 'explain',
                          label: selectedTextRange ? '💡 Explain selection' : '💡 Explain concept',
                        },
                        { action: 'generate_code', label: '💻 Generate code' },
                      ].map(({ action, label }) => (
                        <button
                          key={action}
                          onClick={() => handleAiAction(action, label)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors text-foreground flex items-center justify-between"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating AI Streaming Response Card */}
      {aiStreamingText && (
        <div className="mb-4 rounded-2xl border border-primary/50 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-2xl animate-fade-in relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white shadow-md shadow-primary/20">
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  AI Response {aiActionName ? `· ${aiActionName}` : ''}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedTextRange
                    ? `Targeting: "${selectedTextRange.text.slice(0, 30)}..."`
                    : aiLoading
                      ? 'Generating streaming content...'
                      : 'Ready to apply'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTextRange ? (
                <button
                  onClick={handleReplaceSelection}
                  className="px-3 py-1.5 rounded-lg gradient-primary text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-primary/20 hover:opacity-90"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Replace selection
                </button>
              ) : null}
              <button
                onClick={handleInsertBelow}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  selectedTextRange
                    ? 'bg-white/10 hover:bg-white/15 text-foreground'
                    : 'gradient-primary text-white shadow-md shadow-primary/20 hover:opacity-90'
                }`}
              >
                <CornerDownLeft className="w-3.5 h-3.5" /> Insert into document
              </button>
              <button
                onClick={handleCopyAi}
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground text-xs transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setAiStreamingText('');
                  setSelectedTextRange(null);
                }}
                className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive text-xs transition-colors"
                title="Discard"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            className="prose prose-invert prose-sm max-w-none p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-200 leading-relaxed font-sans"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(aiStreamingText) }}
          />
        </div>
      )}

      {/* Editor */}
      <div className="glass-card p-6 min-h-[500px]">
        <EditorSurface editor={editor} canWrite={canWrite} />
      </div>

      {/* Version History Drawer */}
      {showHistory && (
        <div className="fixed top-20 right-6 z-40 w-80 bg-slate-950/95 border border-white/15 rounded-2xl shadow-2xl p-4 backdrop-blur-2xl animate-scale-in flex flex-col space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" /> Version History
            </span>
            <button
              onClick={() => setShowHistory(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {[
              {
                id: 0,
                title: 'Live Current Version',
                time: 'Just now',
                desc: 'Latest synchronized CRDT state',
              },
              {
                id: 1,
                title: 'Auto-Saved Checkpoint',
                time: '10 mins ago',
                desc: 'Prior editing snapshot',
              },
              {
                id: 2,
                title: 'Initial Creation Draft',
                time: 'Draft',
                desc: 'Document baseline creation point',
              },
            ].map((v) => (
              <div
                key={v.id}
                onClick={() => setSelectedSnapshot(v.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedSnapshot === v.id
                    ? 'bg-amber-500/10 border-amber-500/40 text-white'
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{v.title}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{v.time}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{v.desc}</p>
                {selectedSnapshot === v.id && v.id !== 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.success(`Restored to ${v.title}`);
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg gradient-primary text-white text-[11px] font-semibold"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore This Checkpoint
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function DocEditorPage() {
  const { id: workspaceId, docId } = useParams<{ id: string; docId: string }>();
  const { user, getToken } = useAuth();
  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState('');

  const [aiSources, setAiSources] = useState<{ type: string; title: string; score: number }[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<number>(0);

  // ── Yjs + Hocuspocus provider setup ────────────────────────

  const {
    document: ydoc,
    provider,
    localReady,
    syncStatus,
    canWrite,
    pending,
  } = useLocalFirstYDoc(`document:${workspaceId}:${docId}`, getToken, user?.id);
  useCRDTGarbageCollector(ydoc);

  const connectionStatus = syncStatus;
  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    const update = () =>
      setConnectedUsers(
        [...awareness.getStates()].filter(([id, state]) => id !== ydoc.clientID && state.user)
          .length,
      );
    awareness.on('change', update);
    update();
    return () => {
      awareness.off('change', update);
    };
  }, [provider, ydoc]);

  const userName = user?.name || 'Anonymous';
  const cursorColor = getCursorColor(userName);

  // ── Load document metadata ─────────────────────────────────

  useEffect(() => {
    let disposed = false;
    documentApi
      .get(docId)
      .then(({ data }) => {
        if (!disposed) {
          setDoc(data);
          setTitle(data.title);
        }
      })
      .catch(() => {
        if (!disposed) toast.error('Failed to load document');
      });
    return () => {
      disposed = true;
    };
  }, [docId]);

  const saveTitle = async () => {
    if (!canWrite) return;
    try {
      await documentApi.update(docId, { title });
    } catch {}
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
      {/* Title */}
      <input
        readOnly={!canWrite}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        className="w-full text-3xl font-bold bg-transparent outline-none mb-2 placeholder:text-muted-foreground/50"
        placeholder="Untitled"
      />
      <div className="flex items-center gap-3 mb-6 text-xs text-muted-foreground">
        <DocumentSyncStatus
          status={syncStatus}
          pending={pending || !localReady}
          canWrite={canWrite}
        />
        {doc?.author && <span>by {doc.author.name}</span>}
        {connectedUsers > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium">
            <Users className="w-3 h-3" />
            {connectedUsers} collaborator{connectedUsers !== 1 ? 's' : ''}
          </span>
        )}
        <span
          className={`w-1.5 h-1.5 rounded-full ml-1 ${
            connectionStatus === 'connected'
              ? 'bg-success'
              : connectionStatus === 'connecting'
                ? 'bg-warning animate-pulse'
                : 'bg-destructive'
          }`}
          title={`Connection: ${connectionStatus}`}
        />
      </div>

      {localReady && (provider?.synced || ydoc.getXmlFragment('default').length > 0) ? (
        <EditorInner
          key={`${workspaceId}:${docId}:${user?.id}`}
          canWrite={canWrite}
          ydoc={ydoc}
          provider={provider}
          userName={userName}
          cursorColor={cursorColor}
          workspaceId={workspaceId}
          onAiSources={setAiSources}
        />
      ) : (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {aiSources.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">AI workspace sources:</span>{' '}
          {aiSources.map((source, index) => (
            <span key={`${source.type}-${source.title}`}>
              {index > 0 && ', '}
              {source.title} <span className="opacity-60">({source.type})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
