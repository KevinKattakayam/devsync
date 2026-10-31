import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import { RequestHandler } from 'express';
import { timingSafeEqual } from 'crypto';
export const metrics = new Registry();
export const httpRequests = new Counter({ name: 'devsync_http_requests_total', help: 'Completed HTTP requests', labelNames: ['method', 'route', 'status'], registers: [metrics] });
export const httpLatency = new Histogram({ name: 'devsync_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route'], registers: [metrics], buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15] });
export const aiCalls = new Counter({ name: 'devsync_ai_calls_total', help: 'Provider calls', labelNames: ['provider'], registers: [metrics] });
export const aiErrors = new Counter({ name: 'devsync_ai_errors_total', help: 'Provider call failures', labelNames: ['provider'], registers: [metrics] });
let collaboration = () => ({ connections: 0, rooms: 0 });
export function registerCollaborationMetrics(source: typeof collaboration) { collaboration = source; }
new Gauge({ name: 'devsync_websocket_connections', help: 'Active document connections on this instance', registers: [metrics], collect() { this.set(collaboration().connections); } });
new Gauge({ name: 'devsync_websocket_rooms', help: 'Loaded collaboration rooms on this instance', registers: [metrics], collect() { this.set(collaboration().rooms); } });
export const measureHttp: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.once('finish', () => {
    const method = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
    const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
    httpRequests.inc({ method, route, status: `${Math.floor(res.statusCode / 100)}xx` });
    httpLatency.observe({ method, route }, Number(process.hrtime.bigint() - start) / 1e9);
  });
  next();
};
export const metricsEndpoint: RequestHandler = async (req, res, next) => {
  const secret = process.env.METRICS_BEARER_TOKEN;
  if (!secret || secret.length < 32) { res.status(404).json({ error: 'Endpoint not found' }); return; }
  const expected = Buffer.from(`Bearer ${secret}`); const supplied = Buffer.from(req.header('authorization') || '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.status(403).json({ error: 'Access denied' }); return; }
  try { res.type(metrics.contentType).send(await metrics.metrics()); } catch (error) { next(error); }
};
