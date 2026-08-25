import { redis, isRedisAvailable } from './redis';

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Generic Redis cache layer with graceful degradation.
 * If Redis is unavailable, all operations silently no-op.
 */
export const cache = {
  /** Retrieve a cached value. Returns `null` on miss or Redis failure. */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  /** Store a value with optional TTL (seconds). */
  async set(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch {
      // Cache write failure is non-critical
    }
  },

  /** Delete a specific cache key. */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch {
      // Cache delete failure is non-critical
    }
  },

  /** Delete all keys matching a glob pattern. Use sparingly in production. */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const available = await isRedisAvailable();
      if (!available) return;

      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor, 'MATCH', pattern, 'COUNT', 100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Pattern invalidation failure is non-critical
    }
  },
};

// ── Cache key builders ───────────────────────────────────────────

export const CacheKeys = {
  snippetList: (workspaceId: string) => `devsync:snippets:${workspaceId}`,
  snippet: (snippetId: string) => `devsync:snippet:${snippetId}`,
} as const;
