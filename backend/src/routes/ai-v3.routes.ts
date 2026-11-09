import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { aiLimiter } from '../middleware/rate-limit.middleware';
import { admitAi, aiUsageV3 } from '../middleware/ai-quota.middleware';
import { meteredAiRequest } from '../middleware/billing.middleware';
import { aiComplete, aiCompleteSchema } from '../controllers/ai.controller';
import { AiLimitError } from '../services/ai-quota';
import { AI_MAX_BODY_BYTES, AI_MAX_INPUT_CHARACTERS } from '../services/ai-provider';
import { AppError } from '../utils/errors';
import { aiUsageV3Query } from '../services/ai-schema';
import { groundedInput, groundedPreview } from '../services/grounded-ai';
export const boundAiRequest: RequestHandler = (req, _res, next) => {
  const input = aiCompleteSchema.parse(req.body);
  if (
    input.prompt.length + (input.context?.length || 0) > AI_MAX_INPUT_CHARACTERS ||
    (req.rawBody?.byteLength || 0) > AI_MAX_BODY_BYTES
  )
    return next(new AppError('AI request size limit exceeded', 413));
  next();
};
const router = Router();
router.use(authMiddleware);
router.post(
  '/grounded',
  aiLimiter,
  (req, res, next) => {
    if (process.env.FEATURE_GROUNDED_AI !== 'true') return res.sendStatus(404);
    next();
  },
  validate(groundedInput),
  meteredAiRequest,
  async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await groundedPreview(req.user!.userId, req.body);
      if (result.status === 'insufficient_evidence') req.aiQuotaRefund = true;
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);
router.get('/usage', (req, res, next) => {
  try {
    aiUsageV3Query.parse(req.query);
    void aiUsageV3(req, res, next);
  } catch (error) {
    next(error);
  }
});
router.post(
  '/complete',
  aiLimiter,
  validate(aiCompleteSchema),
  boundAiRequest,
  admitAi,
  meteredAiRequest,
  aiComplete,
);
const typedLimit: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error instanceof AiLimitError) {
    res.setHeader('Retry-After', String(error.retryAfter));
    res.status(429).json({ error: error.message, limit: error.limit });
  } else next(error);
};
router.use(typedLimit);
export default router;
