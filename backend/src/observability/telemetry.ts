import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

export function startTelemetry(serviceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true' || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
    return;
  const exporter = new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
  });
  const allowed = new Set([
    'http.method',
    'http.request.method',
    'http.status_code',
    'http.response.status_code',
    'http.route',
    'db.system',
    'db.operation',
    'db.operation.name',
    'request.id',
    'gen_ai.system',
  ]);
  sdk = new NodeSDK({
    serviceName,
    autoDetectResources: false,
    traceExporter: {
      export(spans, callback) {
        exporter.export(
          spans.map((span) => ({
            name: ['ai.complete', 'db.tenant_transaction'].includes(span.name)
              ? span.name
              : span.instrumentationScope.name,
            kind: span.kind,
            spanContext: () => span.spanContext(),
            parentSpanContext: span.parentSpanContext,
            startTime: span.startTime,
            endTime: span.endTime,
            duration: span.duration,
            ended: span.ended,
            resource: span.resource,
            instrumentationScope: span.instrumentationScope,
            droppedAttributesCount: span.droppedAttributesCount,
            droppedEventsCount: span.droppedEventsCount,
            droppedLinksCount: span.droppedLinksCount,
            attributes: Object.fromEntries(
              Object.entries(span.attributes).filter(([key]) => allowed.has(key)),
            ),
            events: [],
            links: [],
            status: { code: span.status.code },
          })),
          callback,
        );
      },
      shutdown: () => exporter.shutdown(),
    },
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-ioredis': { dbStatementSerializer: (command) => command },
      }).filter((instrumentation) =>
        [
          '@opentelemetry/instrumentation-http',
          '@opentelemetry/instrumentation-express',
          '@opentelemetry/instrumentation-pg',
          '@opentelemetry/instrumentation-ioredis',
        ].includes(instrumentation.instrumentationName),
      ),
    ],
  });
  sdk.start();
}

export async function stopTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

export function activeTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
