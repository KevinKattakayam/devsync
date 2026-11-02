import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors';
export const sourceKindSchema = z.enum(['document', 'task']);
export const receiptContentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    rationale: z.string().trim().min(1).max(8000),
    sourceKind: sourceKindSchema,
    sourceId: z.string().min(1).max(191),
    sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
    excerpt: z.string().trim().min(1).max(5000),
  })
  .strict();
export const receiptEditSchema = receiptContentSchema.extend({ revision: z.number().int().min(0) });
export const receiptRevisionSchema = z.object({ revision: z.number().int().min(0) }).strict();
export const supersedeSchema = receiptRevisionSchema.extend({
  replacementId: z.string().min(1).max(191),
});
export function plainDocument(value: Prisma.JsonValue): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  if (value.type === 'text') return typeof value.text === 'string' ? value.text : '';
  if (value.type === 'hardBreak') return '\n';
  const content = Array.isArray(value.content) ? value.content : [];
  return content
    .map(plainDocument)
    .join(['paragraph', 'heading', 'codeBlock'].includes(String(value.type)) ? '' : '\n');
}
export function sourceFingerprint(kind: string, id: string, revision: string, text: string) {
  return createHash('sha256')
    .update(JSON.stringify([kind, id, revision, text]))
    .digest('hex');
}
export async function receiptSource(
  tx: TenantTransaction,
  workspaceId: string,
  kind: string,
  id: string,
) {
  if (kind === 'document') {
    // Same row lock as CRDT persistence: acceptance cannot race a source edit.
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${id} AND "workspaceId"=${workspaceId} FOR SHARE`;
    const doc = await tx.document.findFirst({ where: { id, workspaceId, isArchived: false } });
    if (!doc) throw new NotFoundError('Source unavailable');
    const text = `${doc.title}\n${plainDocument(doc.content)}`.slice(0, 64000);
    return {
      kind: 'document' as const,
      id,
      title: doc.title,
      text,
      revision: sourceFingerprint(
        kind,
        id,
        `${doc.crdtRevision}:${doc.updatedAt.toISOString()}`,
        text,
      ),
    };
  }
  if (kind !== 'task') throw new BadRequestError('Invalid source kind');
  await tx.$queryRaw`SELECT t.id FROM "Task" t JOIN "Column" c ON c.id=t."columnId" JOIN "Board" b ON b.id=c."boardId" WHERE t.id=${id} AND b."workspaceId"=${workspaceId} FOR SHARE OF t,c,b`;
  const task = await tx.task.findFirst({ where: { id, column: { board: { workspaceId } } } });
  if (!task) throw new NotFoundError('Source unavailable');
  const text = `${task.title}\n${task.description || ''}`.slice(0, 64000);
  return {
    kind: 'task' as const,
    id,
    title: task.title,
    text,
    revision: sourceFingerprint(kind, id, task.updatedAt.toISOString(), text),
  };
}
export async function validateReceiptSource(
  tx: TenantTransaction,
  workspaceId: string,
  input: z.infer<typeof receiptContentSchema>,
) {
  const source = await receiptSource(tx, workspaceId, input.sourceKind, input.sourceId);
  if (source.revision !== input.sourceRevision)
    throw new ConflictError('Source changed. Reload the source and review your quote.');
  if (!source.text.includes(input.excerpt))
    throw new BadRequestError('Quote must match the selected source exactly');
  return source;
}
