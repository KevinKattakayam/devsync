import { z } from 'zod';
import type { TenantTransaction } from '../lib/tenant-prisma';
export const githubExecutionSchema = z.object({
  repositoryId: z.string(),
  workspaceId: z.string(),
  kind: z.enum(['pull_request', 'check_run', 'review']),
  subject: z.string(),
  state: z.string(),
  conclusion: z.string().nullable(),
  headSha: z.string().nullable(),
  pullNumber: z.number().int().positive().nullable(),
  providerAt: z.coerce.date(),
  observedAt: z.coerce.date(),
  rank: z.number().int(),
});
const prInput = z.object({
  number: z.number().int().positive(),
  updated_at: z.iso.datetime(),
  merged: z.boolean().optional(),
  state: z.enum(['open', 'closed']).optional(),
  head: z.object({ sha: z.string().regex(/^[a-f0-9]{40,64}$/) }).optional(),
});
const checkInput = z.object({
  id: z.number().int().positive(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.string().max(100).nullable().optional(),
  head_sha: z.string().regex(/^[a-f0-9]{40,64}$/),
  started_at: z.iso.datetime().nullable().optional(),
  completed_at: z.iso.datetime().nullable().optional(),
});
/** Caller holds current repository authority and the workspace write lock. */
export async function recordGitHubExecution(
  tx: TenantTransaction,
  repository: { id: string; workspaceId: string },
  event: string,
  action: string | undefined,
  raw: unknown,
) {
  let kind: 'pull_request' | 'check_run' | 'review',
    subject: string,
    state: string,
    conclusion: string | null = null,
    headSha: string | null = null,
    providerAt: string,
    rank: number,
    pullNumber: number | null = null;
  if (event === 'pull_request') {
    const input = prInput.safeParse(raw);
    if (!input.success) return true; // Preserve legacy unversioned webhook compatibility; no ordering claim.
    const value = input.data;
    kind = 'pull_request';
    subject = String(value.number);
    pullNumber = value.number;
    state = value.merged ? 'merged' : value.state || (action === 'closed' ? 'closed' : 'open');
    rank = state === 'merged' ? 3 : state === 'closed' ? 2 : 1;
    providerAt = value.updated_at;
    headSha = value.head?.sha ?? null;
  } else if (event === 'check_run') {
    const input = checkInput.safeParse(raw);
    if (!input.success) return false;
    const value = input.data,
      date = value.completed_at || value.started_at;
    if (!date) return false; // Do not invent a provider timestamp for unversioned evidence.
    kind = 'check_run';
    subject = String(value.id);
    state = value.status;
    conclusion = state === 'completed' ? (value.conclusion ?? null) : null;
    rank = state === 'completed' ? 3 : state === 'in_progress' ? 2 : 1;
    providerAt = date;
    headSha = value.head_sha;
  } else if (event === 'pull_request_review') {
    const input = z
      .object({
        review: z.object({
          id: z.number().int().positive(),
          state: z.enum(['approved', 'changes_requested', 'commented', 'dismissed']),
          submitted_at: z.iso.datetime(),
          commit_id: z.string().regex(/^[a-f0-9]{40,64}$/),
        }),
        pull_request: z.object({ number: z.number().int().positive() }),
      })
      .safeParse(raw);
    if (!input.success) return false;
    pullNumber = input.data.pull_request.number;
    kind = 'review';
    subject = String(input.data.review.id);
    state = input.data.review.state;
    headSha = input.data.review.commit_id;
    providerAt = input.data.review.submitted_at;
    rank = state === 'dismissed' ? 2 : 1;
  } else return true;
  const accepted = await tx.$queryRaw<
    { subject: string }[]
  >`INSERT INTO "GitHubExecutionState" ("repositoryId","workspaceId",kind,subject,state,conclusion,"headSha","providerAt",rank,"pullNumber")
    VALUES (${repository.id},${repository.workspaceId},${kind},${subject},${state},${conclusion},${headSha},${new Date(providerAt)},${rank},${pullNumber})
    ON CONFLICT ("repositoryId",kind,subject) DO UPDATE SET state=EXCLUDED.state, conclusion=EXCLUDED.conclusion,"headSha"=EXCLUDED."headSha","providerAt"=EXCLUDED."providerAt",rank=EXCLUDED.rank,"pullNumber"=EXCLUDED."pullNumber","observedAt"=NOW()
    WHERE NOT ("GitHubExecutionState".kind='pull_request' AND "GitHubExecutionState".state='merged')
      AND (EXCLUDED."providerAt",EXCLUDED.rank) > ("GitHubExecutionState"."providerAt","GitHubExecutionState".rank)
    RETURNING subject`;
  return accepted.length > 0;
}
