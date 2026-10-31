import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { reportUnexpected } from '../observability/reporting';
const codes: Record<number, string> = { 400: 'INVALID_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED', 503: 'UNAVAILABLE' };
export const errorEnvelope: RequestHandler = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 400) return json(body);
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const error = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : 'Request failed';
    return json({ ...data, error, code: codes[res.statusCode] || 'INTERNAL_ERROR', requestId: req.requestId });
  };
  next();
};
export const errorMiddleware: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) { next(error); return; }
  if (error instanceof AppError) { res.status(error.statusCode).json({ error: error.message }); return; }
  if (error instanceof ZodError) { res.status(400).json({ error: 'Invalid request' }); return; }
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  if (value.type === 'entity.too.large') { res.status(413).json({ error: 'Payload too large' }); return; }
  if (error instanceof SyntaxError && value.status === 400) { res.status(400).json({ error: 'Invalid or malformed JSON payload' }); return; }
  if (value.code === 'P2025') { res.status(404).json({ error: 'Requested record not found' }); return; }
  if (value.code === 'P2002') { res.status(409).json({ error: 'Record unique constraint failed' }); return; }
  if (value.code === 'P2003') { res.status(400).json({ error: 'Invalid reference or foreign key constraint' }); return; }
  if (value.code === '42501' || /row-level security/i.test(String(value.message || ''))) { res.status(403).json({ error: 'Access denied for this workspace' }); return; }
  if (['JsonWebTokenError', 'TokenExpiredError'].includes(String(value.name))) { res.status(401).json({ error: 'Invalid or expired token' }); return; }
  req.log.error({ requestId: req.requestId }, 'Unexpected server error'); reportUnexpected(req.requestId);
  res.status(500).json({ error: 'Internal server error' });
};
