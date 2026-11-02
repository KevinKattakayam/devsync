import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import { observeAi } from '../observability/ai';
import {
  openAiStream,
  boundedProvider,
  rejectedBeforeAdmission,
  AI_MAX_OUTPUT_CHARACTERS,
} from './ai-provider';
import { AiQuota } from './ai-quota';
import { redis } from '../lib/redis';

const aiRequestSchema = z.object({
  system: z.string().min(1).max(8_000),
  prompt: z.string().min(1).max(32_000),
  maxTokens: z.number().int().min(1).max(2_000).default(200),
  temperature: z.number().min(0).max(2).default(0.3),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

const aiResponseSchema = z.object({
  content: z.string().min(1).max(AI_MAX_OUTPUT_CHARACTERS),
  provider: z.enum(['groq', 'openai']),
});
export type AiResponse = z.infer<typeof aiResponseSchema>;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 10_000, maxRetries: 0 })
  : null;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10_000, maxRetries: 0 })
  : null;

async function callGroq(request: AiRequest): Promise<AiResponse> {
  if (!groq) throw new Error('Groq is not configured');
  const response = await observeAi('groq', () =>
    boundedProvider((signal) =>
      groq.chat.completions.create(
        {
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        },
        { timeout: 10_000, signal },
      ),
    ),
  );
  return aiResponseSchema.parse({
    content: response.choices[0]?.message?.content?.trim(),
    provider: 'groq',
  });
}

async function callOpenAI(request: AiRequest): Promise<AiResponse> {
  if (!openai) throw new Error('OpenAI fallback is not configured');
  const response = await observeAi('openai', () =>
    boundedProvider((signal) =>
      openai.chat.completions.create(
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        },
        { signal },
      ),
    ),
  );
  return aiResponseSchema.parse({
    content: response.choices[0]?.message?.content?.trim(),
    provider: 'openai',
  });
}

/** Callers must establish current user or repository service authority before admission. */
export async function completeWithFallback(
  input: z.input<typeof aiRequestSchema>,
  scope: { actorId: string; workspaceId: string },
): Promise<AiResponse> {
  const request = aiRequestSchema.parse(input);
  const release = await new AiQuota(redis).acquire(scope.actorId, scope.workspaceId);
  let refund = !groq && !openai;
  try {
    return await openAiStream(
      groq ? () => callGroq(request) : null,
      openai ? () => callOpenAI(request) : null,
    );
  } catch (error) {
    if (rejectedBeforeAdmission(error)) refund = true;
    throw error;
  } finally {
    await release(refund).catch(() => undefined);
  }
}
