import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function createClient(role: string): Redis {
  const isTest = process.env.NODE_ENV === 'test';
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,     // Required by BullMQ
    enableReadyCheck: !isTest,
    lazyConnect: isTest,
    retryStrategy(times) {
      if (isTest) return null; // Don't loop retries during unit tests without Redis
      const delay = Math.min(times * 200, 5000);
      console.log(`[Redis:${role}] Reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    reconnectOnError(err) {
      if (isTest) return false;
      const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  if (!isTest) {
    client.on('connect', () => console.log(`[Redis:${role}] Connected`));
    client.on('error', (err) => console.error(`[Redis:${role}] Error:`, err.message));
    client.on('close', () => console.log(`[Redis:${role}] Connection closed`));
  }

  return client;
}

/** Primary Redis client — used for commands, caching, and BullMQ queues. */
export const redis = createClient('primary');

/** Dedicated subscriber client — required by Socket.io Redis adapter (subscribers cannot issue commands). */
export const redisSubscriber = createClient('subscriber');

/** Returns true if Redis is connected and responsive. */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/** Graceful shutdown — disconnect both clients. */
export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSubscriber.quit()]);
}
