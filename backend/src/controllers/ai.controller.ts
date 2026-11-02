import { Request, Response, NextFunction } from 'express';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import {
  openAiStream,
  boundedProvider,
  rejectedBeforeAdmission,
  AI_MAX_INPUT_CHARACTERS,
  AI_MAX_BODY_BYTES,
  aiText,
} from '../services/ai-provider';
import { AppError } from '../utils/errors';
import { untrustedAiContext, AI_CONTEXT_POLICY } from '../services/ai-prompt';
import { observeAi } from '../observability/ai';
import { authorizeWorkspace } from '../security/workspace-policy';
import { semanticWorkspaceContext } from '../services/embedding.service';

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 10000, maxRetries: 0 })
  : null;
const secondary = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10000, maxRetries: 0 })
  : null;
export { aiCompleteSchema } from '../services/ai-schema';
import { aiCompleteSchema } from '../services/ai-schema';

export async function aiComplete(req: Request, res: Response, next: NextFunction) {
  req.aiQuotaStarted = true;
  req.aiQuotaRefund = true;
  let providerOpened = false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60000);
  res.once('close', () => abort.abort());
  try {
    if (!groq && !secondary)
      throw new AppError(
        'AI unavailable: no provider configured. Your documents remain available.',
        503,
      );
    const { prompt, context, action, workspaceId } = aiCompleteSchema.parse(req.body);
    if (
      prompt.length + (context?.length || 0) > AI_MAX_INPUT_CHARACTERS ||
      (req.rawBody?.byteLength || 0) > AI_MAX_BODY_BYTES
    )
      throw new AppError('AI request size limit exceeded', 413);
    await authorizeWorkspace(req.user!.userId, workspaceId);
    const semanticContext = await semanticWorkspaceContext(
      workspaceId,
      `${prompt}\n${context || ''}`,
      6,
      req.user!.userId,
    );
    const workspaceContext = semanticContext
      .map((item) => `[${item.type}: ${item.title}]\n${item.body}`)
      .join('\n\n');

    const systemPrompts: Record<string, string> = {
      continue:
        'You are a helpful writing assistant. Continue the text naturally, maintaining the same style, tone, and format. Output clean markdown.',
      improve:
        'You are an expert editor. Improve the given text for clarity, conciseness, and professionalism. Return the improved version in markdown.',
      summarize:
        'You are a summarization expert. Create a concise, well-structured summary with key takeaways and bullet points.',
      fix_grammar:
        'You are a grammar expert. Fix all grammar, spelling, and punctuation errors. Return only the corrected text.',
      explain:
        'You are a technical writer. Explain the given text, code, or concept clearly with examples and tables if helpful.',
      generate_code:
        'You are an expert software engineer. Generate complete, clean, and well-commented code based on the prompt or document context. Always format your output with proper markdown code blocks (e.g. ```typescript ... ```).',
      custom:
        'You are an expert AI assistant inside DevSync developer workspace. Fulfill the user instruction accurately and output clean markdown.',
    };

    const systemPrompt =
      (systemPrompts[action || 'continue'] || systemPrompts.continue) + ' ' + AI_CONTEXT_POLICY;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Send provenance before completion starts so the client can render sources
    // even if a streamed completion is interrupted.
    res.write(
      `data: ${JSON.stringify({ sources: semanticContext.map(({ type, title, score }) => ({ type, title, score: Number(score.toFixed(3)) })) })}\n\n`,
    );

    await observeAi(groq ? 'groq' : 'openai', async () => {
      const parameters = {
        model: '',
        messages: [
          { role: 'system' as const, content: systemPrompt },
          ...(context || workspaceContext
            ? [
                {
                  role: 'user' as const,
                  content: untrustedAiContext(context || '', semanticContext),
                },
              ]
            : []),
          { role: 'user' as const, content: prompt },
        ],
        stream: true as const,
        max_tokens: 1024,
        temperature: 0.7,
      };
      req.aiQuotaRefund = false;
      const stream = await openAiStream<
        AsyncIterable<{ choices: { delta?: { content?: string | null } }[] }>
      >(
        groq
          ? async () =>
              boundedProvider((signal) =>
                groq.chat.completions.create(
                  { ...parameters, model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b' },
                  { signal: AbortSignal.any([signal, abort.signal]) },
                ),
              )
          : null,
        secondary
          ? async () =>
              boundedProvider((signal) =>
                secondary.chat.completions.create(
                  { ...parameters, model: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
                  { signal: AbortSignal.any([signal, abort.signal]) },
                ),
              )
          : null,
      );

      providerOpened = true;
      for await (const content of aiText(stream, abort.signal)) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    });
    if (abort.signal.aborted) throw new Error('AI request cancelled');
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: unknown) {
    if (!providerOpened && rejectedBeforeAdmission(error)) req.aiQuotaRefund = true;
    if (!res.headersSent) {
      next(error);
    } else {
      res.write(
        `data: ${JSON.stringify({ error: 'AI request failed', code: 'AI_FAILED', requestId: req.requestId })}\n\n`,
      );
      res.end();
    }
  } finally {
    clearTimeout(timer);
    abort.abort();
    await req.aiQuotaRelease?.(req.aiQuotaRefund);
  }
}
