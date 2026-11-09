import { automationDeadLetter } from '../lib/queue';

it('never copies automation payloads, names, IDs or provider errors to the dead letter record', () => {
  const record = automationDeadLetter(3, new Date('2026-11-09T00:00:00Z'));
  expect(record).toEqual({
    sourceQueue: 'devsync-automation',
    sourceJobId: undefined,
    name: 'automation',
    data: null,
    attemptsMade: 3,
    failedReason: 'Automation execution failed',
    failedAt: '2026-11-09T00:00:00.000Z',
  });
});
