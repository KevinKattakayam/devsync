import { Router } from 'express';
import { applyBillingWebhook } from '../security/service-policy';
const router = Router();
router.post('/', async (req, res, next) => {
  try {
    const signature = req.header('stripe-signature');
    if (!signature || !req.rawBody)
      return res.status(400).json({ error: 'Missing Stripe signature' });
    await applyBillingWebhook(req.rawBody, signature);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});
export default router;
