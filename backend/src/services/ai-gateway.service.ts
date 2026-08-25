import CircuitBreaker from 'opossum';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { z } from 'zod';

const aiRequestSchema = z.object({
  system: z.string().min(1).max(8_000),
  prompt: z.string().min(1).max(32_000),
  maxTokens: z.number().int().min(1).max(2_000).default(200),
  temperature: z.number().min(0).max(2).default(0.3),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

const aiResponseSchema = z.object({ content: z.string().min(1), provider: z.enum(['groq', 'openai']) });
export type AiResponse = z.infer<typeof aiResponseSchema>;

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10_000, maxRetries: 0 }) : null;

function isRateLimit(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  return candidate.status === 429 || /rate.?limit|429/i.test(candidate.message || '');
}

async function callGroq(request: AiRequest): Promise<AiResponse> {
  if (!groq) throw new Error('Groq is not configured');
  const response = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.prompt }],
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  }, { timeout: 10_000 });
  return aiResponseSchema.parse({ content: response.choices[0]?.message?.content?.trim(), provider: 'groq' });
}

async function callOpenAI(request: AiRequest): Promise<AiResponse> {
  if (!openai) throw new Error('OpenAI fallback is not configured');
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.prompt }],
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  });
  return aiResponseSchema.parse({ content: response.choices[0]?.message?.content?.trim(), provider: 'openai' });
}

const primary = new CircuitBreaker(callGroq, {
  timeout: 10_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 5,
  // Rate limits and timeouts must open the circuit; application validation does not.
  errorFilter: (error: unknown) => !isRateLimit(error) && !(error instanceof Error && /timed? out/i.test(error.message)),
});
primary.on('open', () => console.warn('[AI Gateway] Groq circuit opened; routing to OpenAI'));

/** Provider-neutral completion. A failed primary immediately invokes fallback. */
export async function completeWithFallback(input: z.input<typeof aiRequestSchema>): Promise<AiResponse> {
  const request = aiRequestSchema.parse(input);
  try {
    return await primary.fire(request);
  } catch (primaryError) {
    try {
      return await callOpenAI(request);
    } catch (fallbackError) {
      const error = new Error('All configured AI providers failed');
      (error as Error & { primary?: unknown; fallback?: unknown }).primary = primaryError;
      (error as Error & { primary?: unknown; fallback?: unknown }).fallback = fallbackError;
      throw error;
    }
  }
}
