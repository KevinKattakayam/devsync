import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint && process.env.OTEL_SDK_DISABLED !== 'true') {
  new NodeSDK({ serviceName: 'devsync-web', traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }) }).start();
}
