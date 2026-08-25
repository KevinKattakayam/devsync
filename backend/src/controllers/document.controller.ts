import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { queueEmbedding } from '../services/embedding.service';

export const createDocumentSchema = z.object({
  title: z.string().max(200).optional(),
  parentId: z.string().optional(),
  icon: z.string().max(10).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.any().optional(),
  icon: z.string().max(10).optional(),
  isPublished: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

async function requireDocumentAccess(userId: string, documentId: string, write = false) {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { workspaceId: true } });
  if (!document) throw new NotFoundError('Document not found');
  const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: document.workspaceId } } });
  if (!member || (write && member.role === 'VIEWER')) throw new ForbiddenError(write ? 'Requires EDITOR or OWNER role' : 'Not a workspace member');
  return document;
}

export async function getDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const documents = await prisma.withTenantTransaction(workspaceId, (tx) => tx.document.findMany({
      where: { workspaceId, isArchived: false, parentId: null },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        children: {
          where: { isArchived: false },
          include: {
            author: { select: { id: true, name: true, avatar: true } },
            children: {
              where: { isArchived: false },
              select: { id: true, title: true, icon: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }));
    res.json(documents);
  } catch (error) {
    next(error);
  }
}

export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const documentId = String(req.params.docId || req.params.id);
    await requireDocumentAccess(req.user!.userId, documentId);
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        children: {
          where: { isArchived: false },
          select: { id: true, title: true, icon: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    res.json(document);
  } catch (error) {
    next(error);
  }
}

export async function createDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const { title, parentId, icon } = req.body;

    const document = await prisma.withTenantTransaction(workspaceId, (tx) => tx.document.create({
      data: {
        title: title || 'Untitled',
        icon: icon || '📄',
        authorId: req.user!.userId,
        workspaceId,
        parentId,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    }));

    await prisma.activity.create({
      data: {
        type: 'doc_created',
        message: `created document "${document.title}"`,
        userId: req.user!.userId,
        workspaceId,
      },
    });

    res.status(201).json(document);
    queueEmbedding('document', document.id);
  } catch (error) {
    next(error);
  }
}

export async function updateDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const documentId = String(req.params.docId || req.params.id);
    await requireDocumentAccess(req.user!.userId, documentId, true);
    const { title, content, icon, isPublished, isArchived } = req.body;

    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(icon !== undefined && { icon }),
        ...(isPublished !== undefined && { isPublished }),
        ...(isArchived !== undefined && { isArchived }),
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    res.json(document);
    if (title !== undefined || content !== undefined) queueEmbedding('document', document.id);
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const documentId = String(req.params.docId || req.params.id);
    await requireDocumentAccess(req.user!.userId, documentId, true);
    // Soft delete
    await prisma.document.update({
      where: { id: documentId },
      data: { isArchived: true },
    });
    res.json({ message: 'Document archived' });
  } catch (error) {
    next(error);
  }
}
