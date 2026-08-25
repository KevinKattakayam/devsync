import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { aiLimiter } from '../middleware/rate-limit.middleware';
import { aiComplete } from '../controllers/ai.controller';
import { meteredAiRequest } from '../middleware/billing.middleware';

const router = Router();

router.use(authMiddleware);
router.post('/complete', aiLimiter, meteredAiRequest, aiComplete);

export default router;
