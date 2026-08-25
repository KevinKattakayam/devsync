import { trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | undefined;

export function startTelemetry(serviceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') return;
  sdk = new NodeSDK({
    serviceName,
    traceExporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces` })
      : undefined,
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  sdk.start();
}

export async function stopTelemetry(): Promise<void> { await sdk?.shutdown(); sdk = undefined; }

export function activeTraceId(): string | undefined { return trace.getActiveSpan()?.spanContext().traceId; }
