import { Socket } from 'socket.io';

interface RateLimiterConfig {
  /** Maximum events allowed within the window. */
  maxEvents: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxEvents: 30,
  windowMs: 10_000,
};

/** Per-event-type overrides (some events like cursor updates are higher frequency). */
const EVENT_LIMITS: Record<string, RateLimiterConfig> = {
  'cursor:update': { maxEvents: 60, windowMs: 10_000 },
  'workspace:join': { maxEvents: 5, windowMs: 10_000 },
  'workspace:leave': { maxEvents: 5, windowMs: 10_000 },
};

/**
 * Token-bucket rate limiter for WebSocket events.
 *
 * Each socket gets a per-event-type bucket. Tokens refill linearly
 * based on elapsed time since last refill.
 */
export class SocketRateLimiter {
  private buckets = new Map<string, Map<string, BucketEntry>>();

  /** Check and consume a token. Returns true if allowed. */
  consume(socket: Socket, eventName: string): boolean {
    const config = EVENT_LIMITS[eventName] || DEFAULT_CONFIG;
    const socketId = socket.id;

    if (!this.buckets.has(socketId)) {
      this.buckets.set(socketId, new Map());
    }

    const socketBuckets = this.buckets.get(socketId)!;
    const now = Date.now();

    if (!socketBuckets.has(eventName)) {
      socketBuckets.set(eventName, {
        tokens: config.maxEvents - 1, // Consume one immediately
        lastRefill: now,
      });
      return true;
    }

    const bucket = socketBuckets.get(eventName)!;

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = config.maxEvents / config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(config.maxEvents, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return false;
    }

    bucket.tokens -= 1;
    return true;
  }

  /** Clean up buckets for a disconnected socket. */
  cleanup(socketId: string): void {
    this.buckets.delete(socketId);
  }
}

export const socketRateLimiter = new SocketRateLimiter();
