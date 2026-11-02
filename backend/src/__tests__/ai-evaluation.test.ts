import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEvaluationCases } from '../../testing/ai-eval/case-file';
import {
  runEvaluation,
  type EvaluationCase,
  type EvaluationOutput,
} from '../../testing/ai-eval/scaffold';
it('loads an empty operator case file without inventing cases or results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devsync-eval-'));
  try {
    const path = join(directory, 'cases.json');
    await writeFile(path, JSON.stringify({ version: 1, cases: [] }));
    expect(await loadEvaluationCases(path)).toEqual([]);
    await writeFile(
      path,
      JSON.stringify({ version: 9, cases: [], private: 'private-test-prompt' }),
    );
    await expect(loadEvaluationCases(path)).rejects.toThrow(
      'Evaluation case file is unavailable or invalid',
    );
    const generate = jest.fn();
    const score = jest.fn();
    expect(await runEvaluation([], generate, score)).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('stops on adapter failure without retrying or scoring nonexistent output', async () => {
  // Structural test fixture only, not an evaluation dataset or model-quality claim.
  const input: EvaluationCase = {
    id: 'structural-only',
    actorId: 'fixture',
    workspaceId: 'fixture',
    prompt: 'Structural test only',
    expectedSourceIds: [],
    forbiddenWorkspaceIds: [],
  };
  const generate = jest.fn(async (_input: EvaluationCase): Promise<EvaluationOutput> => {
    throw new Error('Adapter failed');
  });
  const score = jest.fn();
  await expect(runEvaluation([input], generate, score)).rejects.toThrow('Adapter failed');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(score).not.toHaveBeenCalled();
});
