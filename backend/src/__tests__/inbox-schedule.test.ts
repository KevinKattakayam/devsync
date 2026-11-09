import { planInboxBatch } from '../services/inbox-schedule';
const preferences = {
  timezone: 'America/New_York',
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  batchMinutes: 60 as const,
};
it('honors local quiet hours across the spring daylight saving transition', () => {
  const result = planInboxBatch(
    [{ activityId: 'a', recordedAt: '2026-03-08T06:59:00.000Z' }],
    preferences,
  );
  expect(result).toEqual([{ activityIds: ['a'], eligibleAt: '2026-03-08T11:00:00.000Z' }]);
});
it('does not release a batch during the repeated hour when daylight saving ends', () => {
  const result = planInboxBatch([{ activityId: 'a', recordedAt: '2026-11-01T05:30:00.000Z' }], {
    timezone: 'America/New_York',
    quietStart: 60,
    quietEnd: 120,
    batchMinutes: 15,
  });
  expect(result).toEqual([{ activityIds: ['a'], eligibleAt: '2026-11-01T07:00:00.000Z' }]);
});
it('bounds batch sizes, retains chronological order and rejects duplicate evidence', () => {
  const items = Array.from({ length: 26 }, (_, i) => ({
    activityId: String(i),
    recordedAt: '2026-11-09T12:00:00.000Z',
  }));
  const result = planInboxBatch(items, {
    timezone: 'UTC',
    quietStart: null,
    quietEnd: null,
    batchMinutes: 15,
  });
  expect(result.map((batch) => batch.activityIds.length)).toEqual([25, 1]);
  expect(result.flatMap((batch) => batch.activityIds)).toEqual(
    items.map((item) => item.activityId),
  );
  expect(() => planInboxBatch([items[0], items[0]], preferences)).toThrow();
});
