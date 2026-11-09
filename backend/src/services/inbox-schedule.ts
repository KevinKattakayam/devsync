import { inboxDeliveryPreferenceSchema, type InboxDeliveryPreference } from './inbox-preferences';

type Item = { activityId: string; recordedAt: string };
/** Preview only: no queue, delivery attempt or provider status is created. */
export function planInboxBatch(
  items: Item[],
  raw: InboxDeliveryPreference,
): { activityIds: string[]; eligibleAt: string }[] {
  const preference = inboxDeliveryPreferenceSchema.parse(raw);
  if (items.length > 1000 || new Set(items.map((item) => item.activityId)).size !== items.length)
    throw new Error('Invalid batch evidence');
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: preference.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const quiet = (stamp: number) => {
    if (preference.quietStart === null || preference.quietEnd === null) return false;
    const parts = formatter.formatToParts(new Date(stamp));
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const local = hour * 60 + minute;
    return preference.quietStart < preference.quietEnd
      ? local >= preference.quietStart && local < preference.quietEnd
      : local >= preference.quietStart || local < preference.quietEnd;
  };
  const windowMs = preference.batchMinutes * 60000;
  const dueItems = items
    .map((item, index) => {
      const timestamp = Date.parse(item.recordedAt);
      if (!item.activityId || !Number.isFinite(timestamp))
        throw new Error('Invalid batch evidence');
      let due = Math.ceil(timestamp / windowMs) * windowMs;
      let scans = 0;
      while (quiet(due) && scans++ < 4320) due += 60000;
      if (quiet(due)) throw new Error('Quiet hours could not be resolved');
      return { id: item.activityId, due, index };
    })
    .sort((a, b) => a.due - b.due || a.index - b.index);
  const batches: { activityIds: string[]; eligibleAt: string }[] = [];
  for (const item of dueItems) {
    const eligibleAt = new Date(item.due).toISOString();
    const last = batches.at(-1);
    if (!last || last.eligibleAt !== eligibleAt || last.activityIds.length === 25)
      batches.push({ activityIds: [item.id], eligibleAt });
    else last.activityIds.push(item.id);
  }
  return batches;
}
