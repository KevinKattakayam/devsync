import { digestSource } from '../services/async-digest';
import { idempotentCreate } from '../lib/create-idempotency';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as Y from 'yjs';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { queueEmbedding } from '../services/embedding.service';
import {
  READ_ROLES,
  WRITE_ROLES,
  withResourceAccess,
  withWorkspaceAccess,
} from '../security/workspace-policy';
import { richTextSchema } from '../security/rich-text';
import { legacyDocument, projectDocument } from '../services/crdt-schema';
import { CrdtJournal } from '../services/crdt-journal';

export const createDocumentSchema = z.object({
  title: z.string().max(200).optional(),
  parentId: z.string().min(1).max(191).optional(),
  icon: z.string().max(10).optional(),
});
export const updateDocumentSchema = z.object({
  title: z.string().max(200).optional(),
  content: richTextSchema.optional(),
  crdtRevision: z.number().int().min(0).optional(),
  icon: z.string().max(10).optional(),
  isPublished: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});
export const replaceDocumentContentSchema = z
  .object({
    content: richTextSchema,
    crdtRevision: z.number().int().min(0),
  })
  .strict();
const author = { select: { id: true, name: true, avatar: true } };
export async function getDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const documents = await withWorkspaceAccess(req.user!.userId, workspaceId, READ_ROLES, (tx) =>
      tx.document.findMany({
        where: { workspaceId, isArchived: false, parentId: null },
        include: {
          author,
          children: {
            where: { isArchived: false, workspaceId },
            include: {
              author,
              children: {
                where: { isArchived: false, workspaceId },
                select: { id: true, title: true, icon: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    res.json(documents);
  } catch (error) {
    next(error);
  }
}
export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.docId || req.params.id);
    const document = await withResourceAccess(
      req.user!.userId,
      'document',
      id,
      READ_ROLES,
      (tx, workspaceId) =>
        tx.document.findUnique({
          where: { id },
          include: {
            author,
            children: {
              where: { isArchived: false, workspaceId },
              select: { id: true, title: true, icon: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        }),
    );
    if (!document) throw new NotFoundError('Document not found');
    res.json(document);
  } catch (error) {
    next(error);
  }
}
export async function createDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const { title, parentId, icon } = createDocumentSchema.parse(req.body);
    const document = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      WRITE_ROLES,
      async (tx) =>
        idempotentCreate(
          tx,
          req.user!.userId,
          ['document.create', workspaceId],
          req.header('idempotency-key'),
          { title, parentId, icon },
          async () => {
            if (parentId) {
              const parent = await tx.document.findUnique({
                where: { id: parentId },
                select: { workspaceId: true, isArchived: true },
              });
              if (!parent || parent.workspaceId !== workspaceId || parent.isArchived)
                throw new ForbiddenError('Access denied');
            }
            const state = legacyDocument(null);
            try {
              const result = await tx.document.create({
                data: {
                  title: title || 'Untitled',
                  icon: icon || '📄',
                  authorId: req.user!.userId,
                  workspaceId,
                  parentId,
                  content: projectDocument(state),
                  yjsState: Buffer.from(Y.encodeStateAsUpdate(state)),
                },
                include: { author },
              });
              await tx.activity.create({
                data: {
                  type: 'doc_created',
                  metadata: digestSource('document', result.id, String(result.crdtRevision)),
                  message: `created document "${result.title}"`,
                  userId: req.user!.userId,
                  workspaceId,
                },
              });
              await queueEmbedding('document', result.id, tx, workspaceId, req.user!.userId);
              return result;
            } finally {
              state.destroy();
            }
          },
        ),
    );
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
}
export async function updateDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.docId || req.params.id);
    const { content, crdtRevision, ...metadata } = updateDocumentSchema.parse(req.body);
    const document = await withResourceAccess(
      req.user!.userId,
      'document',
      id,
      WRITE_ROLES,
      async (tx, workspaceId) => {
        if (content !== undefined) {
          // A whole-document replacement needs an explicit revision; never erase newer CRDT edits silently.
          await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${id} AND "workspaceId"=${workspaceId} FOR UPDATE`;
          const existing = await tx.document.findUniqueOrThrow({ where: { id } });
          if (
            (req.method === 'PUT' && crdtRevision === undefined) ||
            (crdtRevision !== undefined && existing.crdtRevision !== crdtRevision)
          )
            throw new ConflictError('Content replacement requires the current crdtRevision');
          let replacement: Y.Doc;
          try {
            replacement = legacyDocument(content);
          } catch {
            throw new BadRequestError('Invalid rich text');
          }
          try {
            await new CrdtJournal(prisma).mutate(tx, { workspaceId, documentId: id }, (state) => {
              const fragment = state.getXmlFragment('default');
              fragment.delete(0, fragment.length);
              fragment.insert(
                0,
                replacement
                  .getXmlFragment('default')
                  .toArray()
                  .map((node) => {
                    if (!(node instanceof Y.XmlElement) && !(node instanceof Y.XmlText))
                      throw new BadRequestError('Invalid rich text node');
                    return node.clone();
                  }),
              );
            });
          } finally {
            replacement.destroy();
          }
        }
        const result = await tx.document.update({
          where: { id },
          data: metadata,
          include: { author },
        });
        if (content !== undefined || metadata.title !== undefined)
          await queueEmbedding('document', id, tx, workspaceId, req.user!.userId);
        return result;
      },
    );
    res.json(document);
  } catch (error) {
    next(error);
  }
}
export async function deleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.docId || req.params.id);
    await withResourceAccess(req.user!.userId, 'document', id, WRITE_ROLES, (tx) =>
      tx.document.update({ where: { id }, data: { isArchived: true } }),
    );
    res.json({ message: 'Document archived' });
  } catch (error) {
    next(error);
  }
}
