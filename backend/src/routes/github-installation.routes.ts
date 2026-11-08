import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError, UnauthorizedError } from '../utils/errors';
export const installationInput = z
  .object({
    action: z.string().max(100),
    installation: z.object({
      id: z.number().int().positive(),
      app_id: z.number().int().positive(),
    }),
    repositories_removed: z
      .array(z.object({ id: z.number().int().positive() }))
      .max(1000)
      .optional(),
  })
  .passthrough();
export const githubInstallationRouter = Router();
githubInstallationRouter.post('/', async (req, res, next) => {
  try {
    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET,
      appId = process.env.GITHUB_APP_ID;
    if (!secret || secret.length < 32 || !appId)
      throw new AppError('GitHub installation verification unavailable', 503);
    const raw = req.rawBody,
      signature = req.header('x-hub-signature-256') || '';
    const expected = `sha256=${createHmac('sha256', secret)
      .update(raw || Buffer.alloc(0))
      .digest('hex')}`;
    if (
      !raw ||
      !/^sha256=[a-f0-9]{64}$/.test(signature) ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnauthorizedError('Invalid webhook signature');
    const event = req.header('x-github-event');
    if (!['installation', 'installation_repositories'].includes(event || ''))
      return res.status(202).json({ ignored: 'Unsupported installation event' });
    const input = installationInput.parse(req.body);
    if (String(input.installation.app_id) !== appId)
      throw new UnauthorizedError('Invalid installation authority');
    const all = event === 'installation' && ['deleted', 'suspend'].includes(input.action);
    const removed =
      event === 'installation_repositories' && input.action === 'removed'
        ? input.repositories_removed?.map((r) => String(r.id)) || []
        : [];
    if (!all && !removed.length) return res.status(202).json({ ignored: 'No access withdrawal' });
    const installationId = String(input.installation.id);
    const bindings = await prisma.gitHubRepository.findMany({
      where: { installationId, ...(!all ? { repositoryId: { in: removed } } : {}) },
      select: { id: true, workspaceId: true },
    });
    for (const binding of bindings)
      await prisma.withTenantTransaction(binding.workspaceId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${binding.workspaceId} FOR UPDATE`;
        await tx.gitHubRepository.updateMany({
          where: {
            id: binding.id,
            workspaceId: binding.workspaceId,
            installationId,
            providerDisconnectedAt: null,
          },
          data: { providerDisconnectedAt: new Date() },
        });
      });
    res.status(200).json({ processed: 'Installation access withdrawal recorded' });
  } catch (error) {
    next(error);
  }
});
