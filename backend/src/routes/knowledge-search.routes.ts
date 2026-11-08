import { Router, type RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  knowledgeQuery,
  knowledgeSourceQuery,
  searchKnowledge,
} from '../services/knowledge-search';
export function createKnowledgeSearchRouter(authenticate: RequestHandler = authMiddleware) {
  const router = Router({ mergeParams: true });
  router.use(authenticate);
  for (const path of ['/', '/source'])
    router.get(path, async (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const input =
          path === '/' ? knowledgeQuery.parse(req.query) : knowledgeSourceQuery.parse(req.query);
        res.json(await searchKnowledge(req.user!.userId, String(req.params.workspaceId), input));
      } catch (error) {
        next(error);
      }
    });
  return router;
}
export const knowledgeSearchRouter = createKnowledgeSearchRouter();
