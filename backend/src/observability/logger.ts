import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'devsync-api', requestId: 'system' },
  redact: { paths: ['password', 'token', 'secret', 'cookie', 'authorization', 'content', 'prompt', 'req.headers', 'req.body', 'res.headers'], censor: '[REDACTED]' },
});
