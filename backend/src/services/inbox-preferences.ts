import { z } from 'zod';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { digestPreference } from './async-digest';

const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone');
export const inboxDeliveryPreferenceSchema = z
  .object({
    timezone,
    quietStart: z.number().int().min(0).max(1439).nullable(),
    quietEnd: z.number().int().min(0).max(1439).nullable(),
    batchMinutes: z.union([z.literal(15), z.literal(60), z.literal(1440)]),
  })
  .strict()
  .refine(
    (value) =>
      (value.quietStart === null && value.quietEnd === null) ||
      (value.quietStart !== null && value.quietEnd !== null && value.quietStart !== value.quietEnd),
    'Quiet hours require two different times',
  );
export type InboxDeliveryPreference = z.infer<typeof inboxDeliveryPreferenceSchema>;
export async function readInboxDeliveryPreference(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
) {
  await digestPreference(tx, workspaceId, userId);
  const rows = await tx.$queryRaw<
    InboxDeliveryPreference[]
  >`SELECT timezone,"quietStart","quietEnd","batchMinutes" FROM "InboxDeliveryPreference" WHERE "workspaceId"=${workspaceId} AND "userId"=${userId}`;
  return rows[0] ?? { timezone: 'UTC', quietStart: null, quietEnd: null, batchMinutes: 60 };
}
export async function writeInboxDeliveryPreference(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
  input: InboxDeliveryPreference,
) {
  await digestPreference(tx, workspaceId, userId);
  await tx.$executeRaw`INSERT INTO "InboxDeliveryPreference" ("workspaceId","userId",timezone,"quietStart","quietEnd","batchMinutes") VALUES (${workspaceId},${userId},${input.timezone},${input.quietStart},${input.quietEnd},${input.batchMinutes}) ON CONFLICT ("workspaceId","userId") DO UPDATE SET timezone=EXCLUDED.timezone,"quietStart"=EXCLUDED."quietStart","quietEnd"=EXCLUDED."quietEnd","batchMinutes"=EXCLUDED."batchMinutes"`;
  return input;
}
