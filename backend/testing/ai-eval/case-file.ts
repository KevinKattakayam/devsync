import { readFile } from 'fs/promises';
import { z } from 'zod';
import type { EvaluationCase } from './scaffold';
/** Operator-supplied, consented cases only. Parsing never calls a model or logs case bodies. */
export const evaluationFileSchema = z
  .object({
    version: z.literal(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1).max(191),
            actorId: z.string().min(1).max(191),
            workspaceId: z.string().min(1).max(191),
            prompt: z.string().min(1).max(16000),
            expectedSourceIds: z.array(z.string().min(1).max(191)).max(100),
            forbiddenWorkspaceIds: z.array(z.string().min(1).max(191)).max(100),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export async function loadEvaluationCases(path: string): Promise<EvaluationCase[]> {
  try {
    const raw = await readFile(path, 'utf8');
    if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Oversized case file');
    const input: unknown = JSON.parse(raw);
    const result = evaluationFileSchema.safeParse(input);
    if (!result.success) throw new Error('Invalid case file');
    if (new Set(result.data.cases.map((item) => item.id)).size !== result.data.cases.length)
      throw new Error('Duplicate case ID');
    return result.data.cases;
  } catch {
    // Parser diagnostics may contain prompt text or private file paths.
    throw new Error('Evaluation case file is unavailable or invalid');
  }
}
