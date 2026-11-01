/** Scaffold only: callers supply consented cases, provider and scorer. No bundled dataset or claims. */
export interface EvaluationCase {
  id: string;
  workspaceId: string;
  actorId: string;
  prompt: string;
  expectedSourceIds: string[];
  forbiddenWorkspaceIds: string[];
}
export interface EvaluationOutput {
  text: string;
  sourceIds: string[];
  workspaceIds: string[];
}
export interface EvaluationScore {
  caseId: string;
  passed: boolean;
  notes: string[];
}
export type Scorer = (input: EvaluationCase, output: EvaluationOutput) => Promise<EvaluationScore>;
export async function runEvaluation(
  cases: readonly EvaluationCase[],
  generate: (input: EvaluationCase) => Promise<EvaluationOutput>,
  score: Scorer,
): Promise<EvaluationScore[]> {
  const results: EvaluationScore[] = [];
  for (const input of cases) results.push(await score(input, await generate(input)));
  return results;
}
