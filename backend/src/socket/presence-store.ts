import Redis from 'ioredis';
import { z } from 'zod';
import { logger } from '../observability/logger';

const record = z.object({
  id: z.string(),
  socketId: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
});
export type PresenceRecord = z.infer<typeof record>;
const key = (workspaceId: string) => `devsync:presence:${workspaceId}`;
/** Socket-scoped storage preserves other tabs; wire DTO remains aggregated by user. */
export class PresenceStore {
  private memory = new Map<string, Map<string, PresenceRecord>>();
  private pending = new Set<Promise<void>>();
  constructor(
    private command: Redis | null,
    private available: () => Promise<boolean>,
  ) {}
  run(operation: () => Promise<void>): Promise<void> {
    const pending = operation()
      .catch(() => {
        logger.warn('Presence operation failed');
      })
      .finally(() => this.pending.delete(pending));
    this.pending.add(pending);
    return pending;
  }
  async drain() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  async put(workspaceId: string, value: PresenceRecord) {
    const field = `${value.id}:${value.socketId}`;
    if (this.command && (await this.available())) {
      await this.command.hset(key(workspaceId), field, JSON.stringify(value));
      await this.command.expire(key(workspaceId), 300);
    } else {
      let users = this.memory.get(workspaceId);
      if (!users) {
        users = new Map();
        this.memory.set(workspaceId, users);
      }
      users.set(field, value);
    }
  }
  async remove(workspaceId: string, userId: string, socketId: string) {
    const field = `${userId}:${socketId}`;
    if (this.command && (await this.available())) await this.command.hdel(key(workspaceId), field);
    const memory = this.memory.get(workspaceId);
    memory?.delete(field);
    if (!memory?.size) this.memory.delete(workspaceId);
  }
  async users(workspaceId: string): Promise<PresenceRecord[]> {
    const users = new Map<string, PresenceRecord>();
    if (this.command && (await this.available())) {
      const entries = await this.command.hgetall(key(workspaceId));
      for (const [id, raw] of Object.entries(entries)) {
        try {
          const value: unknown = JSON.parse(raw);
          const parsed = record.safeParse(
            value && typeof value === 'object' ? { id, ...value } : value,
          );
          if (parsed.success) users.set(parsed.data.id, parsed.data);
        } catch {
          /* Ignore invalid stale cache entries; they never grant access. */
        }
      }
    } else
      for (const value of this.memory.get(workspaceId)?.values() ?? []) users.set(value.id, value);
    return [...users.values()];
  }
}
