import { NextFunction, Request, Response } from 'express';
import { activeTraceId } from '../observability/telemetry';

declare global { namespace Express { interface Request { traceId?: string; } } }

export function traceContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('trace_id');
  req.traceId = incoming && /^[a-f0-9]{32}$/i.test(incoming) ? incoming : activeTraceId();
  if (req.traceId) res.setHeader('trace_id', req.traceId);
  next();
}
