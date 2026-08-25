import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../utils/errors';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export function currentBillingPeriod(): Date { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); }

export async function assertTokenBalance(workspaceId: string): Promise<void> {
  const workspace = await (prisma as any).workspace.findUnique({
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

  const usage = await (prisma as any).tokenUsage.aggregate({
    where: { workspaceId, createdAt: { gte: currentBillingPeriod() } },
    _sum: { tokens: true },
  });

  const limit = workspace.monthlyTokenLimit || 100000;
  if ((usage._sum.tokens || 0) >= limit) {
    throw new ForbiddenError('Monthly AI token limit reached');
  }
}

export async function recordTokenUsage(workspaceId: string, requestId: string, tokens: number, source: string): Promise<void> {
  let usage: any;
  try { usage = await (prisma as any).tokenUsage.create({ data: { workspaceId, requestId, tokens: Math.max(0, Math.floor(tokens)), source } }); }
  catch (error: any) { if (error?.code === 'P2002') return; throw error; }
  const workspace = await (prisma as any).workspace.findUnique({ where: { id: workspaceId }, select: { stripeCustomerId: true } });
  if (!stripe || !workspace?.stripeCustomerId || usage.tokens === 0) return;
  const meter = await stripe.billing.meterEvents.create({ event_name: process.env.STRIPE_TOKEN_METER_EVENT || 'ai_tokens', payload: { stripe_customer_id: workspace.stripeCustomerId, value: String(usage.tokens) }, identifier: requestId });
  await (prisma as any).tokenUsage.update({ where: { id: usage.id }, data: { stripeMeterEventId: meter.identifier || null } });
}
