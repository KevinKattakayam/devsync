// Real Node execution avoids Jest's CJS VM restriction on SDK dynamic imports.
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { startTelemetry, stopTelemetry } from '../../observability/telemetry';
async function main() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  startTelemetry('devsync-test');
  const offByDefault = !trace.getTracer('test').startSpan('off').isRecording();
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
  startTelemetry('devsync-test');
  trace.getTracer('test').startActiveSpan('ai.complete', (span) => {
    span.setAttribute('gen_ai.system', 'groq');
    span.setAttribute('request.id', 'fixture-request');
    span.setAttribute('prompt', 'DO_NOT_EXPORT');
    span.setAttribute('db.statement', 'DO_NOT_EXPORT');
    span.setAttribute('http.url', 'https://example.test/?secret=DO_NOT_EXPORT');
    span.recordException(new Error('DO_NOT_EXPORT'));
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'DO_NOT_EXPORT' });
    span.end();
  });
  await stopTelemetry();
  process.send?.({ offByDefault });
  process.disconnect?.();
}
void main().catch(() => {
  process.exitCode = 1;
  process.disconnect?.();
});
