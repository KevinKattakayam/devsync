'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { boardApi, documentApi, snippetApi } from '@/lib/api';
import type { Board, Snippet, Workspace } from '@/types';
import { CommandPalette as CommandControl, toast, type CommandAction } from '@/components/ui';
import { flattenDocuments, type DocumentNode } from './shell/document-tree';

export function CommandPalette({
  open,
  onOpenChange,
  workspace,
  workspaces,
  documents,
  trigger,
  onHelp,
  onFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace;
  workspaces: Workspace[];
  documents: DocumentNode[];
  trigger: ReactNode;
  onHelp: () => void;
  onFocus: () => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [resources, setResources] = useState<{
    workspaceId: string;
    boards: Board[];
    snippets: Snippet[];
  }>();
  const [creating, setCreating] = useState(false);
  const workspaceId = workspace?.id;
  useEffect(() => {
    if (!open || !workspaceId) return;
    let disposed = false;
    void Promise.all([boardApi.list(workspaceId), snippetApi.list(workspaceId)])
      .then(([boards, snippets]) => {
        if (!disposed) setResources({ workspaceId, boards: boards.data, snippets: snippets.data });
      })
      .catch(() => {
        if (!disposed) {
          setResources(undefined);
          toast.error('Could not load board and snippet commands');
        }
      });
    return () => {
      disposed = true;
    };
  }, [open, workspaceId]);
  const navigate = (path: string) => () => router.push(path);
  const actions: CommandAction[] = [
    {
      id: 'dashboard',
      label: 'Go to all workspaces',
      keywords: 'dashboard home',
      onSelect: navigate('/dashboard'),
    },
    ...workspaces.map((item) => ({
      id: `workspace-${item.id}`,
      label: `Switch workspace: ${item.name}`,
      onSelect: navigate(`/workspace/${item.id}`),
    })),
    ...(['dark', 'light', 'system'] as const).map((theme) => ({
      id: `theme-${theme}`,
      label: `Switch theme to ${theme}`,
      onSelect: () => setTheme(theme),
    })),
    { id: 'help', label: 'Keyboard shortcuts', onSelect: onHelp },
    { id: 'focus', label: 'Toggle focus mode', onSelect: onFocus },
  ];
  if (workspace) {
    const base = `/workspace/${workspace.id}`;
    actions.push(
      ...[
        { path: '', label: 'Overview' },
        { path: '/docs', label: 'Documents' },
        { path: '/kanban', label: 'Sprint board' },
        { path: '/snippets', label: 'Code snippets' },
        { path: '/settings', label: 'Workspace settings' },
      ].map((item) => ({
        id: `nav-${item.path}`,
        label: `Go to ${item.label}`,
        onSelect: navigate(base + item.path),
      })),
    );
    actions.push(
      ...flattenDocuments(documents).map((doc) => ({
        id: `doc-${doc.id}`,
        label: `Document: ${doc.title || 'Untitled document'}`,
        onSelect: navigate(`${base}/docs/${doc.id}`),
      })),
    );
    if (workspace.role === 'OWNER' || workspace.role === 'EDITOR')
      actions.push({
        id: 'create-document',
        label: creating ? 'Creating document…' : 'Create new document',
        disabled: creating,
        onSelect: () => {
          setCreating(true);
          void documentApi
            .create(workspace.id)
            .then(({ data }) => router.push(`${base}/docs/${data.id}`))
            .catch(() => toast.error('Could not create document'))
            .finally(() => setCreating(false));
        },
      });
    if (resources?.workspaceId === workspace.id) {
      actions.push(
        ...resources.boards.flatMap((board) =>
          board.columns.flatMap((column) =>
            column.tasks.map((task) => ({
              id: `task-${task.id}`,
              label: `Task: ${task.title}`,
              keywords: `${board.name} ${column.name}`,
              onSelect: navigate(`${base}/kanban`),
            })),
          ),
        ),
      );
      actions.push(
        ...resources.snippets.map((snippet) => ({
          id: `snippet-${snippet.id}`,
          label: `Snippet: ${snippet.title}`,
          keywords: snippet.language,
          onSelect: navigate(`${base}/snippets`),
        })),
      );
    }
  }
  return (
    <CommandControl actions={actions} open={open} onOpenChange={onOpenChange} trigger={trigger} />
  );
}
