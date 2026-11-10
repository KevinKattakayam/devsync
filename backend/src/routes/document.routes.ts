import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  getDocument,
  exportMarkdown,
  exportDocumentPdf,
  updateDocument,
  deleteDocument,
  updateDocumentSchema,
  replaceDocumentContentSchema,
} from '../controllers/document.controller';

const router = Router();

router.use(authMiddleware);

router.get('/:id/export-markdown', exportMarkdown);
router.get('/:id/export.pdf', exportDocumentPdf);
router.get('/:id', getDocument);
router.patch('/:id', validate(updateDocumentSchema), updateDocument);
router.put('/:id/content', validate(replaceDocumentContentSchema), updateDocument);
router.delete('/:id', deleteDocument);

export default router;
