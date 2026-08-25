import { Request, Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';

const router = Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

router.post('/', async (req, res, next) => {
  try {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe billing is not configured' });
    const signature = req.header('stripe-signature');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !rawBody) return res.status(400).json({ error: 'Missing Stripe signature' });
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET); }
    catch { return res.status(400).json({ error: 'Invalid Stripe signature' }); }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspaceId;
        if (workspaceId && session.customer) await (prisma as any).workspace.update({ where: { id: workspaceId }, data: { stripeCustomerId: String(session.customer), stripeSubscriptionId: session.subscription ? String(session.subscription) : null, billingStatus: 'active', suspendedAt: null } });
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) await (prisma as any).workspace.updateMany({ where: { stripeCustomerId: String(invoice.customer) }, data: { billingStatus: 'active', suspendedAt: null } });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await (prisma as any).workspace.updateMany({ where: { stripeSubscriptionId: subscription.id }, data: { billingStatus: 'canceled' } });
        break;
      }
      default: break;
    }
    res.status(200).json({ received: true });
  } catch (error) { next(error); }
});

export default router;
