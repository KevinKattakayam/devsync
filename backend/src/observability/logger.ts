import pino, { DestinationStream, LoggerOptions } from 'pino';
import { requestScope } from './request-scope';
const options: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'devsync-api' },
  mixin: () => ({ requestId: requestScope.getStore()?.requestId ?? 'system' }),
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'cookie',
      'authorization',
      'content',
      'prompt',
      'req.headers',
      'req.body',
      'res.headers',
    ],
    censor: '[REDACTED]',
  },
};
export function createLogger(destination?: DestinationStream) {
  return destination ? pino(options, destination) : pino(options);
}
export const logger = createLogger();
