import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { getDocument, updateDocument, deleteDocument, updateDocumentSchema } from '../controllers/document.controller';

const router = Router();

router.use(authMiddleware);

router.get('/:id', getDocument);
router.patch('/:id', validate(updateDocumentSchema), updateDocument);
router.delete('/:id', deleteDocument);

export default router;
