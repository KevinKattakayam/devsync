import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { syncMe, getMe, updateMe, updateMeSchema } from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// OAuth, MFA, SAML and session lifecycle are owned by Clerk. This API only syncs
// the verified identity into DevSync's authorization database.
router.post('/sync', syncMe);
router.get('/me', authMiddleware, getMe);
router.patch('/me', authMiddleware, validate(updateMeSchema), updateMe);

export default router;
