import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import type { TenantTransaction } from './tenant-prisma';
import { BadRequestError, ConflictError } from '../utils/errors';

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  throw new BadRequestError('Request is not JSON data');
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const keySchema = z.string().regex(/^[\x21-\x7e]{1,128}$/);
const validateKey: RequestHandler = (req, _res, next) => {
  const key = req.header('idempotency-key');
  if (key !== undefined && !keySchema.safeParse(key).success)
    return next(new BadRequestError('Invalid Idempotency-Key'));
  next();
};
export const idempotencyKeyHeader = Object.assign(validateKey, { idempotencyKeySchema: keySchema });
/** Caller must authorize before entering. Resource and receipt share this same transaction. */
export async function idempotentCreate<T>(
  tx: TenantTransaction,
  authorityId: string,
  scope: readonly string[],
  key: string | undefined,
  payload: unknown,
  create: () => Promise<T>,
): Promise<T | Prisma.JsonValue> {
  if (key === undefined) return create();
  const parsed = keySchema.safeParse(key);
  if (!parsed.success)
    throw new BadRequestError('Idempotency-Key must be 1-128 printable ASCII characters');
  const id = digest(JSON.stringify([authorityId, scope, parsed.data]));
  const requestHash = digest(canonical(payload));
  await tx.$executeRaw`SELECT set_config('app.current_authority_id', ${authorityId}, true)`;
  // Bounded opportunistic cleanup; never remove the key currently being considered.
  await tx.$executeRaw`DELETE FROM "ApiIdempotencyRecord" WHERE id IN (SELECT id FROM "ApiIdempotencyRecord" WHERE "authorityId"=${authorityId} AND "expiresAt"<NOW() AND id<>${id} ORDER BY "expiresAt" FOR UPDATE SKIP LOCKED LIMIT 100)`;
  await tx.$executeRaw`INSERT INTO "ApiIdempotencyRecord" (id,"authorityId","requestHash","expiresAt") VALUES (${id},${authorityId},${requestHash},NOW()+INTERVAL '24 hours') ON CONFLICT (id) DO NOTHING`;
  const [record] = await tx.$queryRaw<
    { requestHash: string; response: Prisma.JsonValue; expired: boolean; complete: boolean }[]
  >`SELECT "requestHash",response,response IS NOT NULL AS complete,"expiresAt"<=NOW() AS expired FROM "ApiIdempotencyRecord" WHERE id=${id} FOR UPDATE`;
  if (!record) throw new Error('Missing idempotency receipt');
  if (!record.expired && record.requestHash !== requestHash)
    throw new ConflictError('Idempotency-Key was used with a different request');
  if (!record.expired && record.complete) return record.response;
  const result = await create();
  const encoded = JSON.stringify(result);
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > 1024 * 1024)
    throw new BadRequestError('Create response exceeds idempotency limit');
  const response: Prisma.JsonValue = z.json().parse(JSON.parse(encoded));
  await tx.$executeRaw`UPDATE "ApiIdempotencyRecord" SET "requestHash"=${requestHash}, response=${encoded}::jsonb, "expiresAt"=NOW()+INTERVAL '24 hours' WHERE id=${id}`;
  return response;
}
