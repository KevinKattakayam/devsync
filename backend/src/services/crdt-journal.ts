import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { TenantPrismaClient, TenantTransaction } from '../lib/tenant-prisma';
import { legacyDocument, projectDocument } from './crdt-schema';

export interface DocumentRoom { workspaceId: string; documentId: string; }
const MAX_STATE = 8 * 1024 * 1024;
/** Row lock serializes appends, compaction and migration across all API instances. */
export class CrdtJournal {
  constructor(readonly db: TenantPrismaClient) {}
  private async locked(tx: TenantTransaction, room: DocumentRoom) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Document" WHERE id=${room.documentId} AND "workspaceId"=${room.workspaceId} FOR UPDATE`;
    if (!rows.length) throw new Error('Access denied');
    const record = await tx.document.findUniqueOrThrow({ where: { id: room.documentId, workspaceId: room.workspaceId } });
    const document = new Y.Doc();
    try {
      if (record.yjsState) Y.applyUpdate(document, record.yjsState);
      else {
        const initial = legacyDocument(record.content);
        try { Y.applyUpdate(document, Y.encodeStateAsUpdate(initial)); } finally { initial.destroy(); }
        const state = Buffer.from(Y.encodeStateAsUpdate(document));
        await tx.documentCrdtBackup.upsert({ where: { documentId: room.documentId }, create: { ...room, originalContent: record.content ?? Prisma.DbNull, originalState: null, convertedState: state }, update: { restoredAt: null, convertedState: state } });
        await tx.document.update({ where: { id: record.id }, data: { yjsState: state } });
      }
      const updates = await tx.documentUpdate.findMany({ where: room, orderBy: { id: 'asc' } });
      for (const update of updates) Y.applyUpdate(document, update.update);
      return { document, updates };
    } catch (error) { document.destroy(); throw error; }
  }
  async load(room: DocumentRoom): Promise<Uint8Array> {
    return this.db.withTenantTransaction(room.workspaceId, async tx => {
      const { document } = await this.locked(tx, room);
      try { return Y.encodeStateAsUpdate(document); } finally { document.destroy(); }
    });
  }
  async append(room: DocumentRoom, update: Uint8Array): Promise<void> {
    if (update.byteLength > 64 * 1024) throw new Error('Update too large');
    const digest = createHash('sha256').update(update).digest('hex');
    await this.db.withTenantTransaction(room.workspaceId, async tx => {
      const { document, updates } = await this.locked(tx, room);
      try {
        Y.applyUpdate(document, update); // Validate before accepting durable data.
        if (Y.encodeStateAsUpdate(document).byteLength > MAX_STATE) throw new Error('Document limit exceeded');
        await tx.documentUpdate.upsert({ where: { documentId_digest: { documentId: room.documentId, digest } }, create: { ...room, digest, update: Buffer.from(update) }, update: {} });
        if (updates.length >= 63) {
          await tx.document.update({ where: { id: room.documentId }, data: { yjsState: Buffer.from(Y.encodeStateAsUpdate(document)), content: projectDocument(document), embeddingHash: null } });
          await tx.documentUpdate.deleteMany({ where: room });
        }
      } finally { document.destroy(); }
    });
  }
  /** Snapshot comes only from committed journal data, never a stale pod's Y.Doc. */
  async compact(room: DocumentRoom): Promise<void> {
    await this.db.withTenantTransaction(room.workspaceId, async tx => {
      const { document, updates } = await this.locked(tx, room);
      try {
        await tx.document.update({ where: { id: room.documentId }, data: { yjsState: Buffer.from(Y.encodeStateAsUpdate(document)), content: projectDocument(document), embeddingHash: null } });
        if (updates.length) await tx.documentUpdate.deleteMany({ where: { ...room, id: { lte: updates[updates.length - 1].id } } });
      } finally { document.destroy(); }
    });
  }
}
