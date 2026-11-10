import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { READ_ROLES, withWorkspaceAccess } from '../security/workspace-policy';
import { BadRequestError, ConflictError } from '../utils/errors';
import { CrdtJournal } from './crdt-journal';
import { documentToMarkdown } from './markdown-export';
import { exportWorkspaceTasksCsv } from './task-csv';
import { buildWorkspaceArchiveManifest } from './workspace-archive-manifest';

/** All source reads occur under the existing tenant and membership transaction. */
export async function snapshotWorkspaceArchive(userId: string, workspaceId: string) {
  return withWorkspaceAccess(userId, workspaceId, READ_ROLES, async (tx) => {
    const sources = await tx.document.findMany({
      where: { workspaceId, isArchived: false },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    if (sources.length > 100) throw new BadRequestError('Workspace export exceeds document limit');
    const documents: Array<{ id: string; content: Buffer }> = [];
    let bytes = 0;
    const journal = new CrdtJournal(prisma);
    for (const source of sources) {
      const current = await journal.project(tx, { workspaceId, documentId: source.id });
      const content = Buffer.from(documentToMarkdown(current), 'utf8');
      bytes += content.length;
      if (content.length > 256 * 1024 || bytes > 8 * 1024 * 1024)
        throw new BadRequestError('Workspace export exceeds document limits');
      documents.push({ id: source.id, content });
    }
    const tasks = Buffer.from(await exportWorkspaceTasksCsv(tx, workspaceId), 'utf8');
    buildWorkspaceArchiveManifest(documents, tasks);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          ids: sources.map((source) => source.id),
          files: buildWorkspaceArchiveManifest(documents, tasks).files,
        }),
      )
      .digest('hex');
    return { documents, tasks, fingerprint };
  });
}
/** Recheck membership and resource contents after compression before sending any bytes. */
export async function recheckWorkspaceArchive(
  userId: string,
  workspaceId: string,
  fingerprint: string,
) {
  const current = await snapshotWorkspaceArchive(userId, workspaceId);
  if (current.fingerprint !== fingerprint)
    throw new ConflictError('Workspace changed during export; retry');
}
