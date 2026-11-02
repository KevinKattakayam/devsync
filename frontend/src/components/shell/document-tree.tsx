'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { IconButton } from '@/components/ui';

export interface DocumentNode {
  id: string;
  title: string;
  children?: DocumentNode[];
}
export function flattenDocuments(nodes: DocumentNode[]): DocumentNode[] {
  return nodes.flatMap((node) => [node, ...flattenDocuments(node.children || [])]);
}
export function DocumentTree({
  nodes,
  workspaceId,
  pathname,
  onNavigate,
}: {
  nodes: DocumentNode[];
  workspaceId: string;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <ul className="shell-document-list">
      {nodes.map((node) => (
        <DocumentBranch
          key={node.id}
          node={node}
          workspaceId={workspaceId}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}
function DocumentBranch({
  node,
  workspaceId,
  pathname,
  onNavigate,
}: {
  node: DocumentNode;
  workspaceId: string;
  pathname: string;
  onNavigate: () => void;
}) {
  const href = `/workspace/${workspaceId}/docs/${node.id}`;
  const [expanded, setExpanded] = useState(() =>
    flattenDocuments(node.children || []).some((child) => pathname.endsWith(`/docs/${child.id}`)),
  );
  const listId = useId();
  const children = node.children || [];
  return (
    <li>
      <div className="shell-document-row">
        {children.length > 0 ? (
          <IconButton
            label={`${expanded ? 'Collapse' : 'Expand'} ${node.title || 'Untitled document'}`}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </IconButton>
        ) : (
          <span aria-hidden="true" className="w-9 shrink-0" />
        )}
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={pathname === href ? 'page' : undefined}
          className="shell-document-link"
        >
          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{node.title || 'Untitled document'}</span>
        </Link>
      </div>
      {children.length > 0 && (
        <ul
          id={listId}
          hidden={!expanded}
          className="shell-document-list ml-3 border-l border-border"
        >
          {children.map((child) => (
            <DocumentBranch
              key={child.id}
              node={child}
              workspaceId={workspaceId}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
