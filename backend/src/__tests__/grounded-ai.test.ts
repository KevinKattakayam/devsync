import { validateGroundedOutput } from '../services/grounded-ai';
import { evaluateGroundedCases } from '../../testing/ai-eval/grounded';

it('rejects fabricated citations and executable provider actions', () => {
  expect(() =>
    validateGroundedOutput(
      { claims: [{ text: 'Invented [99]', references: [1] }], proposals: [] },
      1,
      'qa',
    ),
  ).toThrow();
  expect(() =>
    validateGroundedOutput(
      { claims: [{ text: 'Claim', references: [2] }], proposals: [] },
      1,
      'qa',
    ),
  ).toThrow();
  expect(() =>
    validateGroundedOutput({ claims: [{ text: 'Claim', references: [] }], proposals: [] }, 1, 'qa'),
  ).toThrow();
  expect(() =>
    validateGroundedOutput(
      { claims: [], proposals: [{ kind: 'execute', command: 'delete everything' }] },
      1,
      'meeting_tasks',
    ),
  ).toThrow();
});

it('requires attributed review cases and reports failures without private output or invented cost', async () => {
  const generate = jest.fn(async (): Promise<never> => {
    throw new Error('private provider failure');
  });
  const item = {
    id: 'fixture',
    actorId: 'fixture',
    workspaceId: 'fixture',
    prompt: 'Synthetic question',
    expectedSourceIds: ['fixture-source'],
    expectedStatements: ['Synthetic answer'],
  };
  await expect(evaluateGroundedCases([item], generate)).rejects.toThrow();
  expect(generate).not.toHaveBeenCalled();
  const report = await evaluateGroundedCases(
    [{ ...item, reviewedBy: 'unit-test-fixture-only', reviewedAt: '2026-11-09T00:00:00Z' }],
    generate,
  );
  expect(report).toMatchObject({
    totalCostUsd: null,
    factualTruthVerified: false,
    reports: [{ status: 'unavailable_or_rejected', expectedCitationsPresent: false }],
  });
  expect(JSON.stringify(report)).not.toContain('private provider failure');
});

it('only returns cited drafts for the explicitly requested purpose', () => {
  const link = {
    kind: 'link',
    source: 1,
    target: 2,
    reason: 'Proposed relation',
    references: [1, 2],
  };
  expect(validateGroundedOutput({ claims: [], proposals: [link] }, 2, 'link').proposals).toEqual([
    link,
  ]);
  expect(() =>
    validateGroundedOutput({ claims: [], proposals: [{ ...link, target: 1 }] }, 2, 'link'),
  ).toThrow();
  expect(() => validateGroundedOutput({ claims: [], proposals: [link] }, 1, 'link')).toThrow();
  const draft = {
    kind: 'task',
    title: 'Review migration',
    description: 'Draft only',
    references: [1],
  };
  expect(() => validateGroundedOutput({ claims: [], proposals: [draft] }, 1, 'qa')).toThrow();
  expect(
    validateGroundedOutput({ claims: [], proposals: [draft] }, 1, 'meeting_tasks').proposals,
  ).toEqual([draft]);
  expect(() =>
    validateGroundedOutput(
      { claims: [], proposals: [{ ...draft, accepted: true }] },
      1,
      'meeting_tasks',
    ),
  ).toThrow();
});
