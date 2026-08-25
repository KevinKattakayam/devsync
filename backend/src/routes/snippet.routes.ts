import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateSnippet, deleteSnippet, updateSnippetSchema, executeSnippet } from '../controllers/snippet.controller';

const router = Router();

router.use(authMiddleware);

router.post('/execute', executeSnippet);
router.patch('/:snippetId', validate(updateSnippetSchema), updateSnippet);
router.delete('/:snippetId', deleteSnippet);

export default router;

