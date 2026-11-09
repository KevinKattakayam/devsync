import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  withWorkspaceAccess,
  authorizeWorkspace,
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
export const timelineInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('human_assertion'),
      evidence: z.string().trim().min(1).max(2000),
      occurredAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('outcome_confirmed'),
      evidence: z.string().trim().min(1).max(2000),
      occurredAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('linked_task'),
      evidence: z.string().trim().min(1).max(2000),
      occurredAt: z.iso.datetime(),
      taskId: z.string().min(1).max(191),
    })
    .strict(),
  z
    .object({
      kind: z.literal('linked_pull_request'),
      evidence: z.string().trim().min(1).max(2000),
      occurredAt: z.iso.datetime(),
      repositoryId: z.string().min(1).max(191),
      pullNumber: z.number().int().positive(),
    })
    .strict(),
]);
router.get<{ workspaceId: string; receiptId: string }>(
  '/:receiptId/timeline',
  async (req, res, next) => {
    try {
      const workspaceId = String(req.params.workspaceId),
        receiptId = String(req.params.receiptId);
      const items = await withWorkspaceAccess(
        req.user!.userId,
        workspaceId,
        READ_ROLES,
        async (tx) => {
          const receipt = await tx.decisionReceipt.findFirst({
            where: { id: receiptId, workspaceId },
          });
          if (!receipt) throw new NotFoundError();
          await receiptSource(tx, workspaceId, receipt.sourceKind, receipt.sourceId);
          const member = await tx.workspaceMember.findUniqueOrThrow({
            where: { userId_workspaceId: { userId: req.user!.userId, workspaceId } },
          });
          return tx.$queryRaw`SELECT e.id,e.kind,e.evidence,e."occurredAt",e."recordedAt",e."createdBy",e."taskId",e."repositoryId",e."pullNumber",t.title AS "taskTitle",t."updatedAt" AS "taskUpdatedAt",g.owner AS "repositoryOwner",g.name AS "repositoryName",p.state AS "pullState",p."providerAt" AS "pullProviderAt",p."observedAt" AS "pullObservedAt", COALESCE((SELECT json_agg(json_build_object('kind',x.kind,'subject',x.subject,'state',x.state,'conclusion',x.conclusion,'providerAt',to_char(x."providerAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'observedAt',to_char(x."observedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'headSha',x."headSha") ORDER BY x."providerAt",x.subject) FROM (SELECT v.* FROM "GitHubExecutionState" v WHERE v."workspaceId"=e."workspaceId" AND v."repositoryId"=g.id AND ((v.kind='review' AND v."pullNumber"=e."pullNumber") OR (v.kind='check_run' AND p."headSha" IS NOT NULL AND v."headSha"=p."headSha")) ORDER BY v."providerAt" DESC,v.subject LIMIT 100) x), '[]'::json) AS "githubEvidence" FROM "DecisionExecutionEvent" e LEFT JOIN "Task" t ON t.id=e."taskId" AND EXISTS (SELECT 1 FROM "Column" c JOIN "Board" b ON b.id=c."boardId" WHERE c.id=t."columnId" AND b."workspaceId"=e."workspaceId") LEFT JOIN "GitHubRepository" g ON g.id=e."repositoryId" AND g."workspaceId"=e."workspaceId" AND g."providerDisconnectedAt" IS NULL LEFT JOIN "GitHubExecutionState" p ON p."repositoryId"=g.id AND p."workspaceId"=e."workspaceId" AND p.kind='pull_request' AND p.subject=e."pullNumber"::text WHERE e."workspaceId"=${workspaceId} AND e."receiptId"=${receiptId} AND (e.kind<>'linked_pull_request' OR (${member.role === 'OWNER'} AND g.id IS NOT NULL AND p.subject IS NOT NULL)) AND (e.kind<>'linked_task' OR t.id IS NOT NULL) ORDER BY e."recordedAt",e.id LIMIT 200`;
        },
      );
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
);
router.post<{ workspaceId: string; receiptId: string }>(
  '/:receiptId/timeline',
  async (req, res, next) => {
    try {
      const workspaceId = String(req.params.workspaceId),
        receiptId = String(req.params.receiptId),
        input = timelineInput.parse(req.body);
      const item = await withWorkspaceAccess(
        req.user!.userId,
        workspaceId,
        WRITE_ROLES,
        async (tx) => {
          const receipt = await tx.decisionReceipt.findFirst({
            where: { id: receiptId, workspaceId },
          });
          if (!receipt) throw new NotFoundError();
          await receiptSource(tx, workspaceId, receipt.sourceKind, receipt.sourceId);
          if (receipt.status !== 'ACCEPTED') throw new ConflictError('Receipt must be accepted');
          let taskId: string | null = null,
            repositoryId: string | null = null,
            pullNumber: number | null = null;
          if (input.kind === 'linked_task') {
            await receiptSource(tx, workspaceId, 'task', input.taskId);
            taskId = input.taskId;
          }
          if (input.kind === 'linked_pull_request') {
            await authorizeWorkspace(req.user!.userId, workspaceId, OWNER_ROLES, tx);
            const repo = await tx.gitHubRepository.findFirst({
              where: { id: input.repositoryId, workspaceId, providerDisconnectedAt: null },
            });
            if (!repo) throw new NotFoundError();
            const proof = await tx.gitHubExecutionState.findFirst({
              where: {
                repositoryId: repo.id,
                workspaceId,
                kind: 'pull_request',
                subject: String(input.pullNumber),
              },
            });
            if (!proof) throw new NotFoundError();
            repositoryId = repo.id;
            pullNumber = input.pullNumber;
          }
          const id = randomUUID();
          await tx.$executeRaw`INSERT INTO "DecisionExecutionEvent" (id,"workspaceId","receiptId",kind,evidence,"occurredAt","createdBy","taskId","repositoryId","pullNumber") VALUES (${id},${workspaceId},${receiptId},${input.kind},${input.evidence},${new Date(input.occurredAt)},${req.user!.userId},${taskId},${repositoryId},${pullNumber})`;
          return { id };
        },
      );
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },
);
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
