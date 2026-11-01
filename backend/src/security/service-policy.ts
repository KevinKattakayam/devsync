import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { AppError, BadRequestError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { decryptSecret } from '../services/secret.service';

/** Service exceptions have independent credentials, never a fabricated OWNER principal. */
async function lockWorkspace(tx: TenantTransaction, workspaceId: string) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { suspendedAt: true },
  });
  if (!workspace || workspace.suspendedAt) throw new ForbiddenError('Access denied');
}
export async function withScimAccess<T>(
  authorization: string | undefined,
  operation: (tx: TenantTransaction, workspaceId: string) => Promise<T>,
): Promise<T> {
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192)
    throw new UnauthorizedError('Invalid SCIM token');
  const hash = createHash('sha256').update(authorization.slice(7)).digest('hex');
  const candidate = await prisma.scimProvisioningToken.findUnique({
    where: { tokenHash: hash },
    select: { workspaceId: true },
  });
  if (!candidate) throw new UnauthorizedError('Invalid SCIM token');
  return prisma.withTenantTransaction(candidate.workspaceId, async (tx) => {
    await lockWorkspace(tx, candidate.workspaceId);
    await tx.$queryRaw`SELECT id FROM "ScimProvisioningToken" WHERE "tokenHash"=${hash} FOR SHARE`;
    const token = await tx.scimProvisioningToken.findUnique({ where: { tokenHash: hash } });
    if (
      !token ||
      token.revokedAt ||
      token.workspaceId !== candidate.workspaceId ||
      token.tokenHash.length !== hash.length ||
      !timingSafeEqual(Buffer.from(token.tokenHash), Buffer.from(hash))
    )
      throw new UnauthorizedError('Invalid SCIM token');
    return operation(tx, candidate.workspaceId);
  });
}
export async function withGitHubWebhookAccess<T>(
  repositoryId: string,
  raw: Buffer,
  signature: string | undefined,
  operation: (
    tx: TenantTransaction,
    repository: NonNullable<Awaited<ReturnType<typeof prisma.gitHubRepository.findUnique>>>,
  ) => Promise<T>,
): Promise<T | null> {
  const repository = await prisma.gitHubRepository.findUnique({ where: { repositoryId } });
  if (!repository) return null;
  return prisma.withTenantTransaction(repository.workspaceId, async (tx) => {
    await lockWorkspace(tx, repository.workspaceId);
    await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE "repositoryId"=${repositoryId} FOR SHARE`;
    const current = await tx.gitHubRepository.findUnique({ where: { repositoryId } });
    if (!current || current.workspaceId !== repository.workspaceId)
      throw new ForbiddenError('Access denied');
    const expected = `sha256=${createHmac('sha256', decryptSecret(current.webhookSecret)).update(raw).digest('hex')}`;
    if (
      !signature ||
      !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnauthorizedError('Invalid webhook signature');
    return operation(tx, current);
  });
}
export async function withRepositoryJobAccess<T>(
  workspaceId: string,
  repositoryId: string,
  operation: (
    tx: TenantTransaction,
    repository: NonNullable<Awaited<ReturnType<typeof prisma.gitHubRepository.findUnique>>>,
  ) => Promise<T>,
): Promise<T> {
  if (!workspaceId || !repositoryId || workspaceId.length > 191 || repositoryId.length > 191)
    throw new ForbiddenError('Unattributed repository job rejected');
  return prisma.withTenantTransaction(workspaceId, async (tx) => {
    await lockWorkspace(tx, workspaceId);
    await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id=${repositoryId} AND "workspaceId"=${workspaceId} FOR SHARE`;
    const repository = await tx.gitHubRepository.findUnique({
      where: { id: repositoryId, workspaceId },
    });
    if (!repository || repository.workspaceId !== workspaceId)
      throw new ForbiddenError('Access denied');
    return operation(tx, repository);
  });
}
export async function withSuperadminAccess<T>(
  req: Request,
  operation: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const configured = process.env.SUPERADMIN_SERVICE_TOKEN,
      supplied = req.header('x-superadmin-service-token');
    if (
      configured &&
      Buffer.byteLength(configured) >= 32 &&
      supplied &&
      Buffer.byteLength(supplied) === Buffer.byteLength(configured) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))
    )
      return operation(tx);
    let clerkId: string | null;
    try {
      clerkId = getAuth(req).userId;
    } catch {
      throw new ForbiddenError('Access denied');
    }
    if (!clerkId) throw new ForbiddenError('Access denied');
    await tx.$queryRaw`SELECT id FROM "User" WHERE "clerkId"=${clerkId} FOR SHARE`;
    const user = await tx.user.findUnique({
      where: { clerkId },
      select: { isActive: true, systemRole: true },
    });
    if (!user?.isActive || user.systemRole !== 'SUPER_ADMIN')
      throw new ForbiddenError('Access denied');
    return operation(tx);
  });
}

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}
/** Only signed billing events may mutate billing fields; they cannot clear an admin suspension. */
export async function applyBillingWebhook(raw: Buffer, signature: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    throw new AppError('Stripe billing is not configured', 503);
  let event: Stripe.Event;
  try {
    event = new Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new BadRequestError('Invalid Stripe signature');
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object,
      workspaceId = session.metadata?.workspaceId,
      customer = stripeId(session.customer);
    if (!workspaceId || !customer) return;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${workspaceId} FOR UPDATE`;
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace || (workspace.stripeCustomerId && workspace.stripeCustomerId !== customer))
        throw new ForbiddenError('Access denied');
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          stripeCustomerId: customer,
          stripeSubscriptionId: stripeId(session.subscription),
          billingStatus: workspace.suspendedAt ? workspace.billingStatus : 'active',
        },
      });
    });
  } else if (
    event.type === 'invoice.payment_succeeded' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const object = event.data.object,
      customer = stripeId(object.customer);
    if (!customer) return;
    await prisma.$transaction(async (tx) => {
      const candidate = await tx.workspace.findUnique({
        where: { stripeCustomerId: customer },
        select: { id: true },
      });
      if (!candidate) return;
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${candidate.id} FOR UPDATE`;
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: candidate.id } });
      if (workspace.stripeCustomerId !== customer) throw new ForbiddenError('Access denied');
      if (
        event.type === 'customer.subscription.deleted' &&
        workspace.stripeSubscriptionId !== object.id
      )
        throw new ForbiddenError('Access denied');
      await tx.workspace.update({
        where: { id: workspace.id },
        data: {
          billingStatus: workspace.suspendedAt
            ? workspace.billingStatus
            : event.type === 'invoice.payment_succeeded'
              ? 'active'
              : 'canceled',
        },
      });
    });
  }
}

export type EmbeddingKind = 'document' | 'snippet' | 'task';
/** Private outbox maintenance authority, bound to an authorized producer's durable scope. */
export async function withEmbeddingAccess<T>(
  workspaceId: string,
  kind: EmbeddingKind,
  resourceId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!workspaceId || workspaceId.length > 191 || !resourceId || resourceId.length > 191)
    throw new ForbiddenError('Access denied');
  return prisma.withTenantTransaction(workspaceId, async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const job = await tx.embeddingJob.findUnique({
      where: { resourceType_resourceId: { resourceType: kind, resourceId } },
    });
    if (!job || job.workspaceId !== workspaceId) throw new ForbiddenError('Access denied');
    const resource =
      kind === 'document'
        ? await tx.document.findUnique({
            where: { id: resourceId, workspaceId, isArchived: false },
            select: { id: true },
          })
        : kind === 'snippet'
          ? await tx.snippet.findUnique({
              where: { id: resourceId, workspaceId },
              select: { id: true },
            })
          : await tx.task.findFirst({
              where: { id: resourceId, column: { board: { workspaceId } } },
              select: { id: true },
            });
    if (!resource) throw new ForbiddenError('Access denied');
    return operation(tx);
  });
}

/** Clerk SDK profile sync is a verified-IdP exception, never a body-supplied user ID. */
export async function withIdentityProfileAccess<T>(
  clerkId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!clerkId || clerkId.length > 191) throw new ForbiddenError('Access denied');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE "clerkId"=${clerkId} FOR UPDATE`;
    const existing = await tx.user.findUnique({ where: { clerkId }, select: { isActive: true } });
    if (existing && !existing.isActive) throw new ForbiddenError('Access denied');
    return operation(tx);
  });
}
