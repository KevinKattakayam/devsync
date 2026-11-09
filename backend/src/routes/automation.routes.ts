import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createAutomationRule,
  listAutomationRules,
  setAutomationEnabled,
} from '../services/automation-store';
import { NotFoundError } from '../utils/errors';
import {
  previewAutomationEvent,
  submitAutomationEvent,
  listAutomationExecutions,
  approveAutomationExecution,
} from '../services/automation-execution';
import { idempotencyKeyHeader } from '../lib/create-idempotency';
export const automationEnabledInput = z
  .object({
    enabled: z.boolean(),
    expectedVersion: z.number().int().min(1).max(2147483647).optional(),
  })
  .strict();
export function createAutomationRouter(authenticate: RequestHandler = authMiddleware) {
  const router = Router({ mergeParams: true });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.FEATURE_AUTOMATION !== 'true')
      return next(new NotFoundError('Endpoint not found'));
    next();
  });
  router.use(authenticate);
  router.get<{ workspaceId: string }>('/', async (req, res, next) => {
    try {
      res.json(await listAutomationRules(req.user!.userId, String(req.params.workspaceId)));
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string }>('/', idempotencyKeyHeader, async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await createAutomationRule(
            req.user!.userId,
            String(req.params.workspaceId),
            req.body,
            req.header('idempotency-key'),
          ),
        );
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string }>('/preview', async (req, res, next) => {
    try {
      res.json(await previewAutomationEvent(req.user!.userId, req.params.workspaceId, req.body));
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string }>('/events', async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await submitAutomationEvent(
            req.user!.userId,
            req.params.workspaceId,
            req.body,
            req.header('idempotency-key'),
          ),
        );
    } catch (error) {
      next(error);
    }
  });
  router.get<{ workspaceId: string }>('/executions', async (req, res, next) => {
    try {
      res.json(await listAutomationExecutions(req.user!.userId, req.params.workspaceId));
    } catch (error) {
      next(error);
    }
  });
  router.post<{ workspaceId: string; executionId: string }>(
    '/executions/:executionId/approve',
    async (req, res, next) => {
      try {
        z.object({}).strict().parse(req.body);
        res.json(
          await approveAutomationExecution(
            req.user!.userId,
            req.params.workspaceId,
            z.string().min(1).max(191).parse(req.params.executionId),
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch<{ workspaceId: string; ruleId: string }>(
    '/:ruleId/enabled',
    async (req, res, next) => {
      try {
        const input = automationEnabledInput.parse(req.body);
        const ruleId = z.string().min(1).max(191).parse(req.params.ruleId);
        res.json(
          await setAutomationEnabled(
            req.user!.userId,
            String(req.params.workspaceId),
            ruleId,
            input.enabled,
            input.expectedVersion,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
