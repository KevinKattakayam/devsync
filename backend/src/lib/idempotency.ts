import { createHash } from 'crypto';
import { redis } from './redis';

const PREFIX = 'devsync:idempotency:';

export type IdempotencyResult<T> = { duplicate: true } | { duplicate: false; value: T };

/** Atomically reserves a webhook delivery.  Redis outages fail closed so an
 * event is never processed twice merely because the deduplication store died. */
export async function withIdempotencyKey<T>(key: string, handler: () => Promise<T>, ttlSeconds = 86_400): Promise<IdempotencyResult<T>> {
  const redisKey = `${PREFIX}${createHash('sha256').update(key).digest('hex')}`;
  const reserved = await redis.set(redisKey, 'processing', 'EX', ttlSeconds, 'NX');
  if (reserved !== 'OK') return { duplicate: true };

  try {
    const value = await handler();
    await redis.set(redisKey, 'completed', 'EX', ttlSeconds);
    return { duplicate: false, value };
  } catch (error) {
    // Permit a retry when processing did not complete.  This is deliberately
    // best-effort; the database unique delivery record remains the second fence.
    await redis.del(redisKey).catch(() => undefined);
    throw error;
  }
}
