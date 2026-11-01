import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { aiLimiter } from '../middleware/rate-limit.middleware';
import { aiComplete, aiCompleteSchema } from '../controllers/ai.controller';
import { meteredAiRequest } from '../middleware/billing.middleware';

import { validate } from '../middleware/validate.middleware';
const router = Router();

router.use(authMiddleware);
router.post('/complete', aiLimiter, validate(aiCompleteSchema), meteredAiRequest, aiComplete);

export default router;
