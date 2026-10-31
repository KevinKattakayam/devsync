import { randomUUID } from 'crypto';
import { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { trace } from '@opentelemetry/api';
import { logger } from '../observability/logger';
import pino, { DestinationStream } from 'pino';
declare global { namespace Express { interface Request { requestId: string; rawBody?: Buffer; } } }
export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  trace.getActiveSpan()?.setAttribute('request.id', req.requestId);
  next();
};
export const createRequestLogging = (destination?: DestinationStream) => pinoHttp<import('http').IncomingMessage, import('http').ServerResponse, never>({
  logger: destination ? pino({ base: { service: 'devsync-api', requestId: 'system' } }, destination) : logger,
  genReqId: (_req, res) => String(res.getHeader('X-Request-ID')),
  customProps: req => ({ requestId: req.id }),
  serializers: {
    req: req => ({ id: req.id, method: req.method }),
    res: res => ({ statusCode: res.statusCode }),
    err: () => ({ type: 'HttpError' }),
  },
});
export const requestLogging = createRequestLogging();
