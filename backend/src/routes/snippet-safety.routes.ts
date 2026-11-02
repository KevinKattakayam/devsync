import { digestSource } from '../services/async-digest';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createSnippetSchema } from '../controllers/snippet.controller';
import { withWorkspaceAccess, READ_ROLES, WRITE_ROLES } from '../security/workspace-policy';
import { preflightSnippet } from '../security/snippet-preflight';
import { idempotentCreate } from '../lib/create-idempotency';
import { queueEmbedding } from '../services/embedding.service';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
export const safetyInputSchema = createSnippetSchema.strict();
export const safetySaveSchema = z
  .object({
    content: safetyInputSchema,
    confirmRedaction: z.literal(true),
    snippetId: z.string().min(1).max(191).optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.snippetId) === Boolean(v.expectedUpdatedAt),
    'An edit requires its current updatedAt',
  );
export const safetyFindingsQuery = z.object({ snippetId: z.string().min(1).max(191) }).strict();
const router = Router({ mergeParams: true });
router.use((_req, _res, next) =>
  process.env.FEATURE_SNIPPET_SAFETY === 'true'
    ? next()
    : next(new NotFoundError('Endpoint not found')),
);
router.use(authMiddleware);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.post('/preflight', validate(safetyInputSchema), async (req, res, next) => {
  try {
    res.json(
      await withWorkspaceAccess(
        req.user!.userId,
        String(req.params.workspaceId),
        WRITE_ROLES,
        async () => {
          const scan = preflightSnippet(safetyInputSchema.parse(req.body));
          if (!safetyInputSchema.safeParse(scan.content).success)
            throw new BadRequestError(
              'Redacted content exceeds a field limit. Shorten it and review again.',
            );
          return scan;
        },
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.get<{ workspaceId: string }>('/findings', async (req, res, next) => {
  try {
    const { snippetId } = safetyFindingsQuery.parse(req.query),
      workspaceId = String(req.params.workspaceId);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      READ_ROLES,
      async (tx) => {
        if (!(await tx.snippet.findFirst({ where: { id: snippetId, workspaceId } })))
          throw new NotFoundError();
        return tx.snippetSafetyFinding.findMany({
          where: { snippetId, workspaceId },
          select: { type: true, maskedPreview: true },
          orderBy: { type: 'asc' },
        });
      },
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.post('/save', validate(safetySaveSchema), async (req, res, next) => {
  try {
    const input = safetySaveSchema.parse(req.body),
      workspaceId = String(req.params.workspaceId);
    const result = await withWorkspaceAccess(
      req.user!.userId,
      workspaceId,
      WRITE_ROLES,
      async (tx) => {
        // No raw input or raw-input fingerprint enters SQL/idempotency storage.
        const scan = preflightSnippet(input.content);
        const parsed = safetyInputSchema.safeParse(scan.content);
        if (!parsed.success)
          throw new BadRequestError(
            'Redacted content exceeds a field limit. Shorten it and review again.',
          );
        if (input.snippetId) {
          const existing = await tx.snippet.findFirst({
            where: { id: input.snippetId, workspaceId },
          });
          if (!existing) throw new NotFoundError();
          if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt)
            throw new ConflictError('Snippet changed. Reload before editing.');
          const snippet = await tx.snippet.update({
            where: { id: existing.id },
            data: {
              ...parsed.data,
              description: parsed.data.description ?? null,
              embeddingHash: null,
            },
            include: { author: { select: { id: true, name: true, avatar: true } } },
          });
          await tx.$executeRaw`UPDATE "Snippet" SET embedding=NULL WHERE id=${snippet.id} AND "workspaceId"=${workspaceId}`;
          await tx.snippetSafetyFinding.deleteMany({
            where: { snippetId: snippet.id, workspaceId },
          });
          if (scan.findings.length)
            await tx.snippetSafetyFinding.createMany({
              data: scan.findings.map((f) => ({ ...f, snippetId: snippet.id, workspaceId })),
            });
          await queueEmbedding('snippet', snippet.id, tx, workspaceId, req.user!.userId);
          return { snippet, findings: scan.findings };
        }
        return idempotentCreate(
          tx,
          req.user!.userId,
          ['snippet.safe-create', workspaceId],
          req.header('idempotency-key'),
          { content: parsed.data, findings: scan.findings },
          async () => {
            const snippet = await tx.snippet.create({
              data: { ...parsed.data, workspaceId, authorId: req.user!.userId },
              include: { author: { select: { id: true, name: true, avatar: true } } },
            });
            if (scan.findings.length)
              await tx.snippetSafetyFinding.createMany({
                data: scan.findings.map((f) => ({ ...f, snippetId: snippet.id, workspaceId })),
              });
            await tx.activity.create({
              data: {
                type: 'snippet_created',
                metadata: digestSource('snippet', snippet.id, snippet.updatedAt.toISOString()),
                message: 'added a snippet through safety preflight',
                userId: req.user!.userId,
                workspaceId,
              },
            });
            await queueEmbedding('snippet', snippet.id, tx, workspaceId, req.user!.userId);
            return { snippet, findings: scan.findings };
          },
        );
      },
    );
    res.status(input.snippetId ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});
export default router;
