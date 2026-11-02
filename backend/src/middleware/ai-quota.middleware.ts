import { NextFunction, Request, Response } from 'express';
import { authorizeWorkspace } from '../security/workspace-policy';
import { redis } from '../lib/redis';
import { AiQuota } from '../services/ai-quota';
declare global {
  namespace Express {
    interface Request {
      aiQuotaRelease?: (refund?: boolean) => Promise<void>;
      aiQuotaRefund?: boolean;
      aiQuotaStarted?: boolean;
    }
  }
}
export async function admitAi(req: Request, res: Response, next: NextFunction) {
  try {
    await authorizeWorkspace(req.user!.userId, String(req.body.workspaceId));
    const release = await new AiQuota(redis).acquire(
      req.user!.userId,
      String(req.body.workspaceId),
    );
    let released = false;
    req.aiQuotaRelease = async (refund = false) => {
      if (released) return;
      released = true;
      await release(refund).catch(() => undefined);
    };
    res.once('close', () => {
      if (!req.aiQuotaStarted) void req.aiQuotaRelease?.(true);
    });
    res.once('finish', () => {
      if (!req.aiQuotaStarted) void req.aiQuotaRelease?.(true);
    });
    next();
  } catch (error) {
    next(error);
  }
}
export async function aiUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const workspace = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    await authorizeWorkspace(req.user!.userId, workspace);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await new AiQuota(redis).usage(req.user!.userId, workspace));
  } catch (error) {
    next(error);
  }
}

export async function aiUsageV3(req: Request, res: Response, next: NextFunction) {
  try {
    const workspace = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    await authorizeWorkspace(req.user!.userId, workspace);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await new AiQuota(redis).chargedUsage(req.user!.userId, workspace));
  } catch (error) {
    next(error);
  }
}
