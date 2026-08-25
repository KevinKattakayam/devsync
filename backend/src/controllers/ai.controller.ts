import { Request, Response, NextFunction } from 'express';
import Groq from 'groq-sdk';
import { BadRequestError } from '../utils/errors';
import { ForbiddenError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { semanticWorkspaceContext } from '../services/embedding.service';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

export async function aiComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { prompt, context, action, workspaceId } = req.body;
    if (!prompt) throw new BadRequestError('Prompt is required');
    if (!workspaceId) throw new BadRequestError('Workspace ID is required');
    const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: req.user!.userId, workspaceId } } });
    if (!membership) throw new ForbiddenError('Not a member of this workspace');
    const semanticContext = await semanticWorkspaceContext(workspaceId, `${prompt}\n${context || ''}`);
    const workspaceContext = semanticContext.map(item => `[${item.type}: ${item.title}]\n${item.body}`).join('\n\n');

    const systemPrompts: Record<string, string> = {
      continue: 'You are a helpful writing assistant. Continue the text naturally, maintaining the same style, tone, and format. Output clean markdown.',
      improve: 'You are an expert editor. Improve the given text for clarity, conciseness, and professionalism. Return the improved version in markdown.',
      summarize: 'You are a summarization expert. Create a concise, well-structured summary with key takeaways and bullet points.',
      fix_grammar: 'You are a grammar expert. Fix all grammar, spelling, and punctuation errors. Return only the corrected text.',
      explain: 'You are a technical writer. Explain the given text, code, or concept clearly with examples and tables if helpful.',
      generate_code: 'You are an expert software engineer. Generate complete, clean, and well-commented code based on the prompt or document context. Always format your output with proper markdown code blocks (e.g. ```typescript ... ```).',
      custom: 'You are an expert AI assistant inside DevSync developer workspace. Fulfill the user instruction accurately and output clean markdown.',
    };

    const systemPrompt = systemPrompts[action || 'continue'] || systemPrompts.continue;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Send provenance before completion starts so the client can render sources
    // even if a streamed completion is interrupted.
    res.write(`data: ${JSON.stringify({ sources: semanticContext.map(({ type, title, score }) => ({ type, title, score: Number(score.toFixed(3)) })) })}\n\n`);

    const stream = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemPrompt },
        ...((context || workspaceContext) ? [{ role: 'user' as const, content: `Current document context:\n${context || ''}\n\nWorkspace context (retrieved semantically):\n${workspaceContext}` }] : []),
        { role: 'user', content: prompt },
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    if (!res.headersSent) {
      next(error);
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}
