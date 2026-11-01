import type Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { AppError } from '../utils/errors';
export interface QuotaLimits {
  userDaily: number;
  userMonthly: number;
  workspaceDaily: number;
  workspaceMonthly: number;
  userConcurrent: number;
  workspaceConcurrent: number;
}
export const defaultAiLimits: QuotaLimits = {
  userDaily: 100,
  userMonthly: 1000,
  workspaceDaily: 1000,
  workspaceMonthly: 10000,
  userConcurrent: 2,
  workspaceConcurrent: 5,
};
export function aiLimits(): QuotaLimits {
  const limits = { ...defaultAiLimits };
  for (const key of Object.keys(limits) as (keyof QuotaLimits)[]) {
    const raw = process.env[`AI_QUOTA_${key.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}`];
    if (raw !== undefined) {
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 1)
        throw new AppError('Invalid AI quota configuration', 503);
      limits[key] = value;
    }
  }
  return limits;
}
const reserve = `
for i=5,6 do redis.call('ZREMRANGEBYSCORE',KEYS[i],'-inf',ARGV[1]) end
for i=1,4 do if tonumber(redis.call('GET',KEYS[i]) or '0')>=tonumber(ARGV[i+2]) then return i end end
for i=5,6 do if redis.call('ZCARD',KEYS[i])>=tonumber(ARGV[i+2]) then return i end end
for i=1,4 do redis.call('INCR',KEYS[i]);redis.call('EXPIRE',KEYS[i],7776000) end
for i=5,6 do redis.call('ZADD',KEYS[i],tonumber(ARGV[1])+120000,ARGV[2]);redis.call('EXPIRE',KEYS[i],180) end
return 0`;
export class AiQuota {
  constructor(
    private readonly client: Pick<Redis, 'eval' | 'mget' | 'zrem'>,
    private readonly limits: QuotaLimits = aiLimits(),
  ) {}
  private keys(user: string, workspace: string, now: Date) {
    const hash = (s: string) => createHash('sha256').update(s).digest('hex');
    const u = hash(user),
      w = hash(workspace),
      day = now.toISOString().slice(0, 10),
      month = day.slice(0, 7);
    return [
      `aiq:u:${u}:d:${day}`,
      `aiq:u:${u}:m:${month}`,
      `aiq:w:${w}:d:${day}`,
      `aiq:w:${w}:m:${month}`,
      `aiq:u:${u}:active`,
      `aiq:w:${w}:active`,
    ];
  }
  async acquire(user: string, workspace: string, now = new Date()) {
    const keys = this.keys(user, workspace, now),
      lease = randomUUID();
    let result: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        this.client.eval(
          reserve,
          6,
          ...keys,
          now.getTime(),
          lease,
          this.limits.userDaily,
          this.limits.userMonthly,
          this.limits.workspaceDaily,
          this.limits.workspaceMonthly,
          this.limits.userConcurrent,
          this.limits.workspaceConcurrent,
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('quota timeout')), 2000);
        }),
      ]);
    } catch {
      throw new AppError('AI quota service unavailable; no provider request started', 503);
    } finally {
      clearTimeout(timer);
    }
    if (result !== 0)
      throw new AppError(
        Number(result) > 4
          ? 'AI concurrency limit reached. Try again when active requests finish.'
          : 'AI daily or monthly request quota exceeded. Check AI usage in settings.',
        429,
      );
    return async () => {
      await Promise.all([this.client.zrem(keys[4], lease), this.client.zrem(keys[5], lease)]);
    };
  }
  async usage(user: string, workspace: string, now = new Date()) {
    const values = await this.client.mget(...this.keys(user, workspace, now).slice(0, 4));
    return {
      unit: 'admitted requests',
      period: 'UTC calendar day/month',
      user: {
        daily: Number(values[0] || 0),
        monthly: Number(values[1] || 0),
        dailyLimit: this.limits.userDaily,
        monthlyLimit: this.limits.userMonthly,
      },
      workspace: {
        daily: Number(values[2] || 0),
        monthly: Number(values[3] || 0),
        dailyLimit: this.limits.workspaceDaily,
        monthlyLimit: this.limits.workspaceMonthly,
      },
    };
  }
}
