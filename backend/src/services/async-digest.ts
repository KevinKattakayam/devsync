import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTransaction } from '../lib/tenant-prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { redactSnippetText } from '../security/snippet-preflight';
export const digestSourceSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(['document', 'snippet', 'task']),
    id: z.string().min(1).max(191),
    revision: z.string().min(1).max(200),
  })
  .strict();
/** Attach only verified IDs/revisions to an existing recorded event; never infer sources by title. */
export function digestSource(
  kind: z.infer<typeof digestSourceSchema>['kind'],
  id: string,
  revision: string,
) {
  return { digestSource: digestSourceSchema.parse({ version: 1, kind, id, revision }) };
}
export const digestCursorSchema = z
  .object({
    workspaceId: z.string().min(1).max(191),
    userId: z.string().min(1).max(191),
    revision: z.number().int().nonnegative(),
    until: z.iso.datetime(),
    afterAt: z.iso.datetime(),
    afterId: z.string().min(1).max(191),
  })
  .strict();
export function encodeDigestCursor(value: z.infer<typeof digestCursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
export function decodeDigestCursor(text: string) {
  try {
    if (text.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(text)) throw new Error();
    return digestCursorSchema.parse(JSON.parse(Buffer.from(text, 'base64url').toString('utf8')));
  } catch {
    throw new BadRequestError('Invalid digest cursor');
  }
}
export const digestPreferenceSchema = z
  .object({
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    acknowledgedAt: z.iso.datetime().nullable(),
    acknowledgedId: z.string().nullable(),
  })
  .strict();
export const digestPreferenceWrite = z
  .object({ enabled: z.boolean(), expectedRevision: z.number().int().nonnegative() })
  .strict();
export const digestAckSchema = z
  .object({
    activityId: z.string().min(1).max(191),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const digestQuerySchema = z
  .object({ cursor: z.string().min(1).max(2048).optional() })
  .strict();
export const digestItemSchema = z
  .object({
    activityId: z.string(),
    recordedAt: z.iso.datetime(),
    eventType: z.enum(['doc_created', 'snippet_created', 'task_created']),
    message: z.string(),
    masked: z.boolean(),
    source: digestSourceSchema,
  })
  .strict();
export const digestPageSchema = z
  .object({
    items: z.array(digestItemSchema),
    nextCursor: z.string().nullable(),
    until: z.iso.datetime(),
    from: z.iso.datetime(),
    preferenceRevision: z.number().int().nonnegative(),
  })
  .strict();
export async function digestPreference(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
  lock = false,
) {
  await tx.$executeRaw`SELECT set_config('app.digest_actor_id',${userId},true)`;
  if (lock) {
    await tx.$executeRaw`INSERT INTO "AsyncDigestPreference" ("workspaceId","userId") VALUES (${workspaceId},${userId}) ON CONFLICT ("workspaceId","userId") DO NOTHING`;
    await tx.$queryRaw`SELECT "userId" FROM "AsyncDigestPreference" WHERE "workspaceId"=${workspaceId} AND "userId"=${userId} FOR UPDATE`;
  }
  const record = await tx.asyncDigestPreference.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return {
    enabled: record?.enabled ?? false,
    revision: record?.revision ?? 0,
    acknowledgedAt: record?.acknowledgedAt?.toISOString() ?? null,
    acknowledgedId: record?.acknowledgedId ?? null,
  };
}
const eligible = (workspaceId: string) => Prisma.sql`
 FROM "Activity" a
 LEFT JOIN "Document" d ON a.type='doc_created' AND a.metadata#>>'{digestSource,kind}'='document'
   AND d.id=a.metadata#>>'{digestSource,id}' AND d."workspaceId"=${workspaceId} AND NOT d."isArchived"
 LEFT JOIN "Snippet" s ON a.type='snippet_created' AND a.metadata#>>'{digestSource,kind}'='snippet'
   AND s.id=a.metadata#>>'{digestSource,id}' AND s."workspaceId"=${workspaceId}
 LEFT JOIN "Task" t ON a.type='task_created' AND a.metadata#>>'{digestSource,kind}'='task' AND t.id=a.metadata#>>'{digestSource,id}'
 LEFT JOIN "Column" c ON c.id=t."columnId"
 LEFT JOIN "Board" b ON b.id=c."boardId" AND b."workspaceId"=${workspaceId}
 WHERE a."workspaceId"=${workspaceId} AND (d.id IS NOT NULL OR s.id IS NOT NULL OR b.id IS NOT NULL)
 AND a.metadata#>'{digestSource,version}'='1'::jsonb
 AND jsonb_typeof(a.metadata#>'{digestSource,id}')='string' AND length(a.metadata#>>'{digestSource,id}') BETWEEN 1 AND 191
 AND jsonb_typeof(a.metadata#>'{digestSource,revision}')='string' AND length(a.metadata#>>'{digestSource,revision}') BETWEEN 1 AND 200
 AND length(a.message) BETWEEN 1 AND 1000`;
type EvidenceRow = {
  id: string;
  createdAt: Date;
  type: 'doc_created' | 'snippet_created' | 'task_created';
  message: string;
  source: Prisma.JsonValue;
};
async function now(tx: TenantTransaction) {
  const [row] = await tx.$queryRaw<{ stamp: Date }[]>`SELECT clock_timestamp() AS stamp`;
  return row.stamp;
}
export async function digestPage(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
  cursor?: string,
) {
  const preference = await digestPreference(tx, workspaceId, userId);
  if (!preference.enabled) throw new ConflictError('Opt in to your digest first');
  const clock = await now(tx),
    key = cursor ? decodeDigestCursor(cursor) : undefined;
  if (
    key &&
    (key.workspaceId !== workspaceId ||
      key.userId !== userId ||
      key.revision !== preference.revision)
  )
    throw new ConflictError(
      'Digest preferences changed or cursor scope does not match. Refresh the digest.',
    );
  const until = key ? new Date(key.until) : clock;
  if (until > clock) throw new BadRequestError('Invalid digest window');
  if (clock.getTime() - until.getTime() > 30 * 60000)
    throw new ConflictError('Digest window expired. Refresh the digest.');
  const horizon = new Date(until.getTime() - 7 * 86400000);
  const acknowledged = preference.acknowledgedAt ? new Date(preference.acknowledgedAt) : null;
  const from = acknowledged && acknowledged > horizon ? acknowledged : horizon;
  const rows = await tx.$queryRaw<
    EvidenceRow[]
  >(Prisma.sql`SELECT a.id,a."createdAt",a.type,a.message,a.metadata->'digestSource' AS source ${eligible(workspaceId)}
    AND a."createdAt">=${horizon} AND a."createdAt"<=${until}
    ${acknowledged ? Prisma.sql`AND (a."createdAt",a.id)>(${acknowledged},${preference.acknowledgedId})` : Prisma.empty}
    ${key ? Prisma.sql`AND (a."createdAt",a.id)>(${new Date(key.afterAt)},${key.afterId})` : Prisma.empty}
    ORDER BY a."createdAt" ASC,a.id ASC LIMIT 26`);
  const page = rows.slice(0, 25),
    last = page[page.length - 1];
  const items = page.map((row) => {
    const masked = redactSnippetText(row.message).text;
    return {
      activityId: row.id,
      recordedAt: row.createdAt.toISOString(),
      eventType: row.type,
      message: masked,
      masked: masked !== row.message,
      source: digestSourceSchema.strip().parse(row.source),
    };
  });
  return {
    items,
    nextCursor:
      rows.length > 25 && last
        ? encodeDigestCursor({
            workspaceId,
            userId,
            revision: preference.revision,
            until: until.toISOString(),
            afterAt: last.createdAt.toISOString(),
            afterId: last.id,
          })
        : null,
    until: until.toISOString(),
    from: from.toISOString(),
    preferenceRevision: preference.revision,
  };
}
export async function acknowledgeDigest(
  tx: TenantTransaction,
  workspaceId: string,
  userId: string,
  activityId: string,
  expectedRevision: number,
) {
  const preference = await digestPreference(tx, workspaceId, userId, true);
  if (!preference.enabled || preference.revision !== expectedRevision)
    throw new ConflictError('Digest preferences changed. Refresh before marking events seen.');
  const clock = await now(tx),
    horizon = new Date(clock.getTime() - 7 * 86400000);
  const [row] = await tx.$queryRaw<{ id: string; createdAt: Date }[]>(
    Prisma.sql`SELECT a.id,a."createdAt" ${eligible(workspaceId)} AND a.id=${activityId} AND a."createdAt">=${horizon} AND a."createdAt"<=${clock}`,
  );
  if (!row) throw new NotFoundError('Activity source unavailable');
  const old = preference.acknowledgedAt ? new Date(preference.acknowledgedAt) : null;
  if (
    old &&
    (row.createdAt < old ||
      (row.createdAt.getTime() === old.getTime() && row.id <= (preference.acknowledgedId || '')))
  )
    return preference;
  const saved = await tx.asyncDigestPreference.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { acknowledgedAt: row.createdAt, acknowledgedId: row.id, revision: { increment: 1 } },
  });
  return {
    enabled: saved.enabled,
    revision: saved.revision,
    acknowledgedAt: saved.acknowledgedAt!.toISOString(),
    acknowledgedId: saved.acknowledgedId,
  };
}

/** Stable evidence permalink; authority is rechecked by the caller on every open. */
export async function digestEvent(tx: TenantTransaction, workspaceId: string, activityId: string) {
  const [row] = await tx.$queryRaw<EvidenceRow[]>(
    Prisma.sql`SELECT a.id,a."createdAt",a.type,a.message,a.metadata->'digestSource' AS source ${eligible(workspaceId)} AND a.id=${activityId}`,
  );
  if (!row) throw new NotFoundError('Activity source unavailable');
  const message = redactSnippetText(row.message).text;
  return {
    activityId: row.id,
    recordedAt: row.createdAt.toISOString(),
    eventType: row.type,
    message,
    masked: message !== row.message,
    source: digestSourceSchema.strip().parse(row.source),
  };
}
