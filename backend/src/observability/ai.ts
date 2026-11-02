import { SpanStatusCode, trace } from '@opentelemetry/api';
import { aiCalls, aiErrors } from './metrics';
export async function observeAi<T>(
  provider: 'groq' | 'openai',
  operation: () => Promise<T>,
): Promise<T> {
  aiCalls.inc({ provider });
  return trace
    .getTracer('devsync')
    .startActiveSpan('ai.complete', { attributes: { 'gen_ai.system': provider } }, async (span) => {
      try {
        return await operation();
      } catch (error) {
        aiErrors.inc({ provider });
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
}
