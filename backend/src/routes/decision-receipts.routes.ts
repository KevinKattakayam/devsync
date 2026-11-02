import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  withWorkspaceAccess,
  READ_ROLES,
  WRITE_ROLES,
  OWNER_ROLES,
} from '../security/workspace-policy';
import {
  receiptContentSchema,
  receiptEditSchema,
  receiptRevisionSchema,
  supersedeSchema,
  sourceKindSchema,
  receiptSource,
  validateReceiptSource,
} from '../services/decision-receipts';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { idempotentCreate } from '../lib/create-idempotency';
export const decisionSourcesQuery = z.object({ q: z.string().max(100).default('') }).strict();
export const decisionSourceQuery = z
  .object({ kind: sourceKindSchema, id: z.string().min(1).max(191) })
  .strict();
const router = Router({ mergeParams: true });
router.use((_req, _res, next) =>
  process.env.FEATURE_DECISION_RECEIPTS === 'true'
    ? next()
    : next(new NotFoundError('Endpoint not found')),
);
router.use(authMiddleware);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get<{ workspaceId: string }>('/sources', async (req, res, next) => {
  try {
    const { q } = decisionSourcesQuery.parse(req.query),
      workspaceId = String(req.params.workspaceId);
    const sources = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      READ_ROLES,
      async (tx) => {
        const documents = await tx.document.findMany({
          where: { workspaceId, isArchived: false, title: { contains: q, mode: 'insensitive' } },
          select: { id: true, title: true },
          orderBy: [{ title: 'asc' }, { id: 'asc' }],
          take: 50,
        });
        const tasks = await tx.task.findMany({
          where: {
            column: { board: { workspaceId } },
            title: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, title: true },
          orderBy: [{ title: 'asc' }, { id: 'asc' }],
          take: 50,
        });
        return [
          ...documents.map((d) => ({ ...d, kind: 'document' as const })),
          ...tasks.map((t) => ({ ...t, kind: 'task' as const })),
        ];
      },
    );
    res.json(sources);
  } catch (error) {
    next(error);
  }
});
router.get<{ workspaceId: string }>('/source', async (req, res, next) => {
  try {
    const input = decisionSourceQuery.parse(req.query);
    res.json(
      await withWorkspaceAccess(
        req.user!.userId,
        String(req.params.workspaceId),
        READ_ROLES,
        (tx) => receiptSource(tx, String(req.params.workspaceId), input.kind, input.id),
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.get<{ workspaceId: string }>('/', async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId);
    const items = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      READ_ROLES,
      async (tx) => {
        const records = await tx.decisionReceipt.findMany({
          where: { workspaceId },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 200,
        });
        const visible = [];
        for (const record of records) {
          try {
            const source = await receiptSource(tx, workspaceId, record.sourceKind, record.sourceId);
            // Do not disclose a replacement ID whose source is now inaccessible.
            let replacementId = record.supersededById;
            if (replacementId) {
              const replacement = await tx.decisionReceipt.findFirst({
                where: { id: replacementId, workspaceId },
              });
              if (replacement) {
                try {
                  await receiptSource(
                    tx,
                    workspaceId,
                    replacement.sourceKind,
                    replacement.sourceId,
                  );
                } catch (error) {
                  if (!(error instanceof NotFoundError)) throw error;
                  replacementId = null;
                }
              }
            }
            visible.push({
              ...record,
              supersededById: replacementId,
              sourceTitle: source.title,
              sourceChanged: source.revision !== record.sourceRevision,
            });
          } catch (error) {
            if (!(error instanceof NotFoundError)) throw error;
          }
        }
        return visible;
      },
    );
    res.json(items);
  } catch (error) {
    next(error);
  }
});
router.post('/', validate(receiptContentSchema), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      input = receiptContentSchema.parse(req.body);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      WRITE_ROLES,
      async (tx) => {
        await validateReceiptSource(tx, workspaceId, input);
        return idempotentCreate(
          tx,
          req.user!.userId,
          ['decision.create', workspaceId],
          req.header('idempotency-key'),
          input,
          async () => {
            await validateReceiptSource(tx, workspaceId, input);
            if ((await tx.decisionReceipt.count({ where: { workspaceId } })) >= 200)
              throw new BadRequestError('Workspace limit of 200 receipts reached');
            return tx.decisionReceipt.create({
              data: { ...input, workspaceId, createdBy: req.user!.userId },
            });
          },
        );
      },
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
router.patch('/:receiptId', validate(receiptEditSchema), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      { revision, ...input } = receiptEditSchema.parse(req.body);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      WRITE_ROLES,
      async (tx) => {
        const record = await tx.decisionReceipt.findFirst({
          where: { id: String(req.params.receiptId), workspaceId },
        });
        if (!record) throw new NotFoundError();
        await receiptSource(tx, workspaceId, record.sourceKind, record.sourceId);
        if (record.status !== 'DRAFT' || record.revision !== revision)
          throw new ConflictError('Receipt changed or is no longer a draft');
        await validateReceiptSource(tx, workspaceId, input);
        return tx.decisionReceipt.update({
          where: { id: record.id },
          data: { ...input, revision: { increment: 1 } },
        });
      },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.delete('/:receiptId', validate(receiptRevisionSchema), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      { revision } = receiptRevisionSchema.parse(req.body);
    await withWorkspaceAccess(req.user!.userId, workspaceId, WRITE_ROLES, async (tx) => {
      const record = await tx.decisionReceipt.findFirst({
        where: { id: String(req.params.receiptId), workspaceId },
      });
      if (!record) throw new NotFoundError();
      await receiptSource(tx, workspaceId, record.sourceKind, record.sourceId);
      if (record.status !== 'DRAFT' || record.revision !== revision)
        throw new ConflictError('Only current drafts can be deleted');
      await tx.decisionReceipt.delete({ where: { id: record.id } });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
router.post('/:receiptId/accept', validate(receiptRevisionSchema), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      { revision } = receiptRevisionSchema.parse(req.body);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        const record = await tx.decisionReceipt.findFirst({
          where: { id: String(req.params.receiptId), workspaceId },
        });
        if (!record) throw new NotFoundError();
        if (record.status !== 'DRAFT' || record.revision !== revision)
          throw new ConflictError('Receipt changed or is no longer a draft');
        await validateReceiptSource(tx, workspaceId, receiptContentSchema.strip().parse(record));
        return tx.decisionReceipt.update({
          where: { id: record.id },
          data: {
            status: 'ACCEPTED',
            acceptedBy: req.user!.userId,
            acceptedAt: new Date(),
            revision: { increment: 1 },
          },
        });
      },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.post('/:receiptId/supersede', validate(supersedeSchema), async (req, res, next) => {
  try {
    const workspaceId = String(req.params.workspaceId),
      input = supersedeSchema.parse(req.body);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      OWNER_ROLES,
      async (tx) => {
        const record = await tx.decisionReceipt.findFirst({
          where: { id: String(req.params.receiptId), workspaceId },
        });
        const replacement = await tx.decisionReceipt.findFirst({
          where: { id: input.replacementId, workspaceId },
        });
        if (!record || !replacement) throw new NotFoundError();
        await receiptSource(tx, workspaceId, record.sourceKind, record.sourceId);
        if (
          record.id === replacement.id ||
          record.status !== 'ACCEPTED' ||
          record.revision !== input.revision ||
          replacement.status !== 'ACCEPTED'
        )
          throw new ConflictError('Choose another current accepted receipt');
        await validateReceiptSource(
          tx,
          workspaceId,
          receiptContentSchema.strip().parse(replacement),
        );
        return tx.decisionReceipt.update({
          where: { id: record.id },
          data: {
            status: 'SUPERSEDED',
            supersededById: replacement.id,
            revision: { increment: 1 },
          },
        });
      },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
export default router;
