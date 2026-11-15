import { z } from 'zod';
import { groundedPreview } from '../../src/services/grounded-ai';
export const reviewedGroundedCases = z
  .array(
    z
      .object({
        id: z.string().min(1).max(191),
        actorId: z.string().min(1).max(191),
        workspaceId: z.string().min(1).max(191),
        prompt: z.string().min(2).max(4000),
        reviewedBy: z.string().min(1).max(191),
        reviewedAt: z.iso.datetime(),
        expectedSourceIds: z.array(z.string().min(1)).min(1).max(6),
        expectedStatements: z.array(z.string().min(1)).min(1).max(12),
      })
      .strict(),
  )
  .max(100);
export type ReviewedGroundedCase = z.infer<typeof reviewedGroundedCases>[number];
/** Explicit matching is a diagnostic, not a truth/entailment score. Never logs source text. */
export async function evaluateGroundedCases(raw: unknown, generate = groundedPreview) {
  const cases = reviewedGroundedCases.parse(raw);
  const reports = [];
  for (const c of cases) {
    const start = performance.now();
    try {
      const result = await generate(c.actorId, {
        workspaceId: c.workspaceId,
        prompt: c.prompt,
        purpose: 'qa',
      });
      const cited = new Set(
        result.claims
          .flatMap((claim) => claim.references)
          .map((ref) => result.sources.find((s) => s.reference === ref)?.id),
      );
      const text = result.claims.map((claim) => claim.text).join('\n');
      reports.push({
        caseId: c.id,
        status: result.status,
        expectedCitationsPresent: c.expectedSourceIds.every((id) => cited.has(id)),
        expectedStatementsPresent: c.expectedStatements.every((s) => text.includes(s)),
        latencyMs: Math.round(performance.now() - start),
        costUsd: null,
        humanSemanticReviewRequired: true,
      });
    } catch {
      reports.push({
        caseId: c.id,
        status: 'unavailable_or_rejected',
        expectedCitationsPresent: false,
        expectedStatementsPresent: false,
        latencyMs: Math.round(performance.now() - start),
        costUsd: null,
        humanSemanticReviewRequired: true,
      });
    }
  }
  return { reports, totalCostUsd: null, costStatus: 'unavailable', factualTruthVerified: false };
}
