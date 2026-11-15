import { createHash } from 'crypto';
import { BadRequestError } from '../utils/errors';

/** Metadata only: generated paths never contain user-provided names or IDs. */
export function buildWorkspaceArchiveManifest(
  documents: Array<{ content: Buffer }>,
  tasks: Buffer,
) {
  if (
    documents.length > 100 ||
    tasks.length > 1024 * 1024 ||
    documents.some((item) => item.content.length > 256 * 1024)
  )
    throw new BadRequestError('Workspace export exceeds entry limits');
  const files = [
    ...documents.map((item, index) => ({
      path: `documents/${String(index + 1).padStart(6, '0')}.md`,
      content: item.content,
    })),
    { path: 'tasks/tasks.csv', content: tasks },
  ];
  if (files.reduce((sum, file) => sum + file.content.length, 0) > 8 * 1024 * 1024)
    throw new BadRequestError('Workspace export exceeds total limit');
  return {
    version: 1,
    scope: 'workspace' as const,
    label: 'Workspace-scoped export; not a complete account backup.',
    privacy: 'Content may contain sensitive information; no content redaction is applied.',
    included: ['supported_document_markdown', 'task_csv_v1'],
    excluded: [
      'account',
      'workspace_metadata',
      'document_metadata',
      'members',
      'integration_credentials',
      'archived_documents',
      'task_labels',
      'task_keys',
      'task_metadata',
      'snippets',
      'decisions',
      'github',
      'activities',
      'automations',
      'all_other_resources',
    ],
    files: files.map((file) => ({
      path: file.path,
      bytes: file.content.length,
      sha256: createHash('sha256').update(file.content).digest('hex'),
    })),
  };
}
