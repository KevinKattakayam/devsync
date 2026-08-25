import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { assertTokenBalance, recordTokenUsage } from '../services/billing.service';

declare global { namespace Express { interface Request { billingRequestId?: string; } } }

/** Rejects exhausted/suspended tenants before an LLM call and meters completion use. */
export async function meteredAiRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.body?.workspaceId || '');
    await assertTokenBalance(workspaceId);
    const requestId = randomUUID();
    req.billingRequestId = requestId;
    res.once('finish', () => {
      if (res.statusCode < 400) {
        const text = `${req.body?.prompt || ''}\n${req.body?.context || ''}`;
        void recordTokenUsage(workspaceId, requestId, Math.ceil(text.length / 4), 'ai_complete').catch((error) => console.error('[Billing] usage report failed', error));
      }
    });
    next();
  } catch (error) { next(error); }
}
