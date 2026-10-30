import { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { TenantPrismaClient } from '../lib/tenant-prisma';
import { DocumentRoom } from './crdt-journal';
import { legacyDocument } from './crdt-schema';

export type MigrationMode = 'dry-run' | 'apply' | 'rollback';
const same = (a: Uint8Array | null, b: Uint8Array | null) =>
  a === null || b === null ? a === b : Buffer.from(a).equals(Buffer.from(b));

/** Run with collaboration/API writes stopped. Every backup and conversion is atomic. */
export async function migrateDocument(
  db: TenantPrismaClient,
  room: DocumentRoom,
  mode: MigrationMode,
) {
  return db.withTenantTransaction(room.workspaceId, async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Document" WHERE id=${room.documentId} AND "workspaceId"=${room.workspaceId} FOR UPDATE`;
    if (!rows.length) throw new Error('Document not found');
    const record = await tx.document.findUniqueOrThrow({
      where: { id: room.documentId, workspaceId: room.workspaceId },
    });
    const backup = await tx.documentCrdtBackup.findUnique({
      where: { documentId: room.documentId },
    });
    const pending = await tx.documentUpdate.count({ where: room });
    if (mode === 'rollback') {
      if (!backup) throw new Error('No retained backup');
      if (backup.restoredAt) return 'already-restored';
      if (pending || !same(record.yjsState, backup.convertedState))
        throw new Error('Rollback refused: subsequent edits exist');
      await tx.document.update({
        where: { id: record.id },
        data: { content: backup.originalContent ?? Prisma.DbNull, yjsState: backup.originalState },
      });
      await tx.documentCrdtBackup.update({
        where: { documentId: record.id },
        data: { restoredAt: new Date() },
      });
      return 'restored';
    }
    if (backup && !backup.restoredAt) return 'already-converted';
    if (pending) throw new Error('Compact pending updates before migration');
    const document = record.yjsState ? new Y.Doc() : legacyDocument(record.content);
    try {
      if (record.yjsState) Y.applyUpdate(document, record.yjsState);
      const convertedState = Buffer.from(Y.encodeStateAsUpdate(document));
      if (convertedState.byteLength > 8 * 1024 * 1024) throw new Error('Document limit exceeded');
      if (mode === 'dry-run') return record.yjsState ? 'snapshot-valid' : 'conversion-valid';
      if (backup) {
        if (
          !same(record.yjsState, backup.originalState) ||
          JSON.stringify(record.content) !== JSON.stringify(backup.originalContent)
        )
          throw new Error('Restored document changed: retain a new backup before reapplying');
        await tx.documentCrdtBackup.update({
          where: { documentId: record.id },
          data: { convertedState, restoredAt: null },
        });
      } else {
        await tx.documentCrdtBackup.create({
          data: {
            ...room,
            originalContent: record.content ?? Prisma.DbNull,
            originalState: record.yjsState,
            convertedState,
          },
        });
      }
      await tx.document.update({ where: { id: record.id }, data: { yjsState: convertedState } });
      return 'converted';
    } finally {
      document.destroy();
    }
  });
}
