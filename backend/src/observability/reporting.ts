import * as Sentry from '@sentry/node';
let enabled = false;
export function startReporting() {
  if (!process.env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    defaultIntegrations: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.extra;
      delete event.breadcrumbs;
      return event;
    },
  });
  enabled = true;
}
export function reportUnexpected(requestId: string) {
  if (enabled)
    Sentry.captureException(new Error('Unexpected server error'), { tags: { requestId } });
}
export async function stopReporting() {
  if (enabled) await Sentry.close(1500);
  enabled = false;
}
