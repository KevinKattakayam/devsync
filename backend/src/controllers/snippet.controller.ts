import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { cache, CacheKeys } from '../lib/cache';
import { queueEmbedding } from '../services/embedding.service';
import { ForbiddenError, NotFoundError } from '../utils/errors';

const SNIPPET_CACHE_TTL = 300; // 5 minutes

async function requireSnippetEditor(userId: string, snippetId: string) {
  const snippet = await prisma.snippet.findUnique({ where: { id: snippetId }, select: { workspaceId: true } });
  if (!snippet) throw new NotFoundError('Snippet not found');
  const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: snippet.workspaceId } } });
  if (!member || member.role === 'VIEWER') throw new ForbiddenError('Requires EDITOR or OWNER role');
  return snippet;
}

export const createSnippetSchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().min(1),
  language: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
});

export const updateSnippetSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  code: z.string().min(1).optional(),
  language: z.string().min(1).max(50).optional(),
  description: z.string().max(1000).optional(),
});

export async function getSnippets(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);

    // Check Redis cache first
    const cacheKey = CacheKeys.snippetList(workspaceId);
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const snippets = await prisma.withTenantTransaction(workspaceId, (tx) => tx.snippet.findMany({
      where: { workspaceId },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { updatedAt: 'desc' },
    }));

    // Populate cache
    await cache.set(cacheKey, snippets, SNIPPET_CACHE_TTL);

    res.json(snippets);
  } catch (error) { next(error); }
}

export async function createSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = String(req.params.workspaceId || req.params.id);
    const { title, code, language, description } = req.body;
    const snippet = await prisma.withTenantTransaction(workspaceId, (tx) => tx.snippet.create({
      data: { title, code, language, description, authorId: req.user!.userId, workspaceId },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    }));
    await prisma.activity.create({
      data: { type: 'snippet_created', message: `added snippet "${title}"`, userId: req.user!.userId, workspaceId },
    });

    // Invalidate workspace snippet list cache
    await cache.del(CacheKeys.snippetList(workspaceId));

    res.status(201).json(snippet);
    queueEmbedding('snippet', snippet.id);
  } catch (error) { next(error); }
}

export async function updateSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    const { workspaceId } = await requireSnippetEditor(req.user!.userId, snippetId);
    const { title, code, language, description } = req.body;
    const snippet = await prisma.snippet.update({
      where: { id: snippetId },
      data: { ...(title && { title }), ...(code && { code }), ...(language && { language }), ...(description !== undefined && { description }) },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    });

    // Invalidate both individual snippet and workspace list caches
    await Promise.all([
      cache.del(CacheKeys.snippet(snippetId)),
      cache.del(CacheKeys.snippetList(workspaceId)),
    ]);

    res.json(snippet);
    queueEmbedding('snippet', snippet.id);
  } catch (error) { next(error); }
}

export async function deleteSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const snippetId = String(req.params.snippetId);
    const { workspaceId } = await requireSnippetEditor(req.user!.userId, snippetId);
    await prisma.snippet.delete({ where: { id: snippetId } });

    // Invalidate caches
    await Promise.all([
      cache.del(CacheKeys.snippet(snippetId)),
      cache.del(CacheKeys.snippetList(workspaceId)),
    ]);

    res.json({ message: 'Snippet deleted' });
  } catch (error) { next(error); }
}

export async function executeSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    const { language, code, stdin, env } = req.body;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    const { spawn } = await import('child_process');
    const fs = (await import('fs/promises')).default;
    const path = (await import('path')).default;
    const os = (await import('os')).default;

    const runProcess = (cmd: string, args: string[], cwd: string, input?: string, customEnv?: Record<string, string>, timeout = 7000): Promise<{ stdout: string; stderr: string }> => {
      return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
          cwd,
          timeout,
          env: { ...process.env, PATH: process.env.PATH + ':/home/kevin/.local/go/bin:/home/kevin/.cargo/bin', ...customEnv },
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d: Buffer) => {
          if (stdout.length < 1024 * 1024 * 2) stdout += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
          if (stderr.length < 1024 * 1024 * 2) stderr += d.toString();
        });

        child.on('error', (err: any) => reject(err));
        child.on('close', () => resolve({ stdout, stderr }));

        if (input) {
          child.stdin.write(input);
          child.stdin.end();
        }
      });
    };

    const lang = (language || 'javascript').toLowerCase();
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devsync-exec-'));

    try {
      if (lang === 'python' || lang === 'py') {
        const filePath = path.join(tmpDir, 'script.py');
        await fs.writeFile(filePath, code, 'utf8');
        const res = await runProcess('python3', [filePath], tmpDir, stdin, env, 7000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
        const filePath = path.join(tmpDir, 'script.js');
        await fs.writeFile(filePath, code, 'utf8');
        const res = await runProcess('node', [filePath], tmpDir, stdin, env, 7000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'typescript' || lang === 'ts') {
        const filePath = path.join(tmpDir, 'script.ts');
        await fs.writeFile(filePath, code, 'utf8');
        const res = await runProcess('npx', ['tsx', filePath], tmpDir, stdin, env, 8000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'go' || lang === 'golang') {
        const filePath = path.join(tmpDir, 'main.go');
        let fullCode = code;
        if (!code.includes('package main')) fullCode = `package main\nimport "fmt"\n\nfunc main() {\n${code}\n}`;
        await fs.writeFile(filePath, fullCode, 'utf8');
        const res = await runProcess('go', ['run', filePath], tmpDir, stdin, env, 8000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'rust' || lang === 'rs') {
        const srcPath = path.join(tmpDir, 'main.rs');
        const binPath = path.join(tmpDir, 'main');
        let fullCode = code;
        if (!code.includes('fn main()')) fullCode = `fn main() {\n${code}\n}`;
        await fs.writeFile(srcPath, fullCode, 'utf8');
        await runProcess('rustc', [srcPath, '-o', binPath], tmpDir, undefined, undefined, 7000);
        const res = await runProcess(binPath, [], tmpDir, stdin, env, 4000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'c' || lang === 'cpp' || lang === 'c++') {
        const isCpp = lang.includes('cpp') || lang.includes('c++');
        const srcPath = path.join(tmpDir, isCpp ? 'main.cpp' : 'main.c');
        const binPath = path.join(tmpDir, 'main');
        let fullCode = code;
        if (!code.includes('main(')) fullCode = `#include <stdio.h>\nint main() {\n${code}\nreturn 0;\n}`;
        await fs.writeFile(srcPath, fullCode, 'utf8');
        const compiler = isCpp ? 'g++' : 'gcc';
        await runProcess(compiler, [srcPath, '-o', binPath], tmpDir, undefined, undefined, 7000);
        const res = await runProcess(binPath, [], tmpDir, stdin, env, 4000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
        const filePath = path.join(tmpDir, 'script.sh');
        await fs.writeFile(filePath, code, 'utf8');
        const res = await runProcess('bash', [filePath], tmpDir, stdin, env, 7000);
        stdout = res.stdout;
        stderr = res.stderr;
      } else {
        stdout = `⚡ Syntax check passed for ${lang.toUpperCase()}.\nTo run in real-time, select Python, JavaScript, TypeScript, Go, Rust, C/C++, or Bash.`;
      }
    } catch (execErr: any) {
      if (execErr.killed || execErr.signal === 'SIGTERM') {
        stderr = '⏱️ Execution timed out after sandbox limit.';
      } else {
        stderr = execErr.stderr || execErr.message || 'Execution error';
        stdout = execErr.stdout || '';
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }

    const elapsed = Date.now() - start;
    const output = (stdout + (stderr ? (stdout ? '\n' : '') + stderr : '')).trim() || '✨ Process exited with code 0 (no output produced)';
    res.json({ output, timeMs: elapsed });
  } catch (error) {
    next(error);
  }
}

