import { z } from 'zod';
export const workspaceSearchSchema = z.object({
  q: z.string().trim().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
