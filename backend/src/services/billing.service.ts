import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';
import { READ_ROLES, withWorkspaceAccess } from '../security/workspace-policy';
import { ForbiddenError } from '../utils/errors';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export function currentBillingPeriod(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function assertTokenBalance(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { monthlyTokenLimit: true, billingStatus: true, suspendedAt: true },
  });

  if (!workspace || workspace.suspendedAt) {
    throw new ForbiddenError('Workspace is suspended');
  }

  // In development or when Stripe is not configured, grant free access
  if (!process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV !== 'production') {
    return;
  }

  const usage = await prisma.tokenUsage.aggregate({
    where: { workspaceId, createdAt: { gte: currentBillingPeriod() } },
    _sum: { tokens: true },
  });

  const limit = workspace.monthlyTokenLimit || 100000;
  if ((usage._sum.tokens || 0) >= limit) {
    throw new ForbiddenError('Monthly AI token limit reached');
  }
}

export async function recordTokenUsage(
  workspaceId: string,
  requestId: string,
  tokens: number,
  source: string,
  actorId: string,
): Promise<void> {
  if (!Number.isFinite(tokens) || tokens < 0) throw new ForbiddenError('Invalid usage');
  const count = Math.floor(tokens);
  const { usage, workspace } = await withWorkspaceAccess(
    actorId,
    workspaceId,
    READ_ROLES,
    async (tx) => {
      await tx.$executeRaw`INSERT INTO "TokenUsage" (id, "workspaceId", "requestId", tokens, source, "createdAt") VALUES (${randomUUID()}, ${workspaceId}, ${requestId}, ${count}, ${source}, NOW()) ON CONFLICT ("requestId") DO NOTHING`;
      const usage = await tx.tokenUsage.findUniqueOrThrow({ where: { requestId } });
      if (usage.workspaceId !== workspaceId || usage.tokens !== count || usage.source !== source)
        throw new ForbiddenError('Access denied');
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });
      return { usage, workspace };
    },
  );
  if (!stripe || !workspace.stripeCustomerId || usage.tokens === 0 || usage.stripeMeterEventId)
    return;
  const meter = await stripe.billing.meterEvents.create({
    event_name: process.env.STRIPE_TOKEN_METER_EVENT || 'ai_tokens',
    payload: { stripe_customer_id: workspace.stripeCustomerId, value: String(usage.tokens) },
    identifier: requestId,
  });
  await withWorkspaceAccess(actorId, workspaceId, READ_ROLES, (tx) =>
    tx.tokenUsage.update({
      where: { id: usage.id, workspaceId },
      data: { stripeMeterEventId: meter.identifier || null },
    }),
  );
}
