import { z } from 'zod';
export const aiCompleteSchema = z.object({
  prompt: z.string().min(1).max(16000),
  context: z.string().max(32000).optional(),
  workspaceId: z.string().min(1).max(191),
  action: z
    .enum(['continue', 'improve', 'summarize', 'fix_grammar', 'explain', 'generate_code', 'custom'])
    .optional(),
});
export const aiUsageV3Query = z.object({ workspaceId: z.string().min(1).max(191) }).strict();
