import type Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { AppError } from '../utils/errors';
import { logger } from '../observability/logger';
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
export function quotaResets(now: Date) {
  return {
    daily: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
    monthly: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}
export class AiLimitError extends AppError {
  readonly limit: {
    type: 'AI_QUOTA_EXCEEDED' | 'AI_CONCURRENCY_EXCEEDED';
    scope: 'user' | 'workspace';
    period: 'daily' | 'monthly' | 'concurrent';
    resetAt: string;
  };
  readonly retryAfter: number;
  constructor(index: number, resetAt: Date, now: Date) {
    super(
      index > 4
        ? 'AI concurrency limit reached. Try again when active requests finish.'
        : 'AI daily or monthly request quota exceeded. Check AI usage in settings.',
      429,
    );
    this.limit = {
      type: index > 4 ? 'AI_CONCURRENCY_EXCEEDED' : 'AI_QUOTA_EXCEEDED',
      scope: [1, 2, 5].includes(index) ? 'user' : 'workspace',
      period: index > 4 ? 'concurrent' : [1, 3].includes(index) ? 'daily' : 'monthly',
      resetAt: resetAt.toISOString(),
    };
    this.retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  }
}
/** One deadline for fail-closed Redis request commands; queue clients retain their own policy. */
export async function quotaCommand<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_r, reject) => {
        timer = setTimeout(() => reject(new Error('quota storage timeout')), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
// Keys1..4 retain cumulative v2 admissions;7..10 enforce charged reservations.
// Missing charged keys adopt the existing admission count on first use, without resetting a budget.
const reserve = `
local counts={}
for i=5,6 do redis.call('ZREMRANGEBYSCORE',KEYS[i],'-inf',ARGV[1]) end
for i=1,4 do
 counts[i]=tonumber(redis.call('GET',KEYS[i+6]) or redis.call('GET',KEYS[i]) or '0')
 if counts[i]>=tonumber(ARGV[i+2]) then return {i,tonumber(ARGV[i%2==1 and 9 or 10])} end
end
for i=5,6 do if redis.call('ZCARD',KEYS[i])>=tonumber(ARGV[i+2]) then
 local first=redis.call('ZRANGE',KEYS[i],0,0,'WITHSCORES');return {i,tonumber(first[2])}
end end
for i=1,4 do
 redis.call('INCR',KEYS[i]);redis.call('EXPIRE',KEYS[i],7776000)
 redis.call('SET',KEYS[i+6],counts[i]+1,'EX',7776000)
end
for i=5,6 do redis.call('ZADD',KEYS[i],tonumber(ARGV[1])+120000,ARGV[2]);redis.call('EXPIRE',KEYS[i],180) end
return {0,0}`;
const settle = `
local owned=redis.call('ZREM',KEYS[5],ARGV[1])
redis.call('ZREM',KEYS[6],ARGV[1])
if owned==1 and ARGV[2]=='1' then
 for i=7,10 do if tonumber(redis.call('GET',KEYS[i]) or '0')>0 then redis.call('DECR',KEYS[i]) end end
end
return owned`;
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
    const counters = [
      `aiq:u:${u}:d:${day}`,
      `aiq:u:${u}:m:${month}`,
      `aiq:w:${w}:d:${day}`,
      `aiq:w:${w}:m:${month}`,
    ];
    return [
      ...counters,
      `aiq:u:${u}:active`,
      `aiq:w:${w}:active`,
      ...counters.map((key) => `${key}:charged`),
    ];
  }
  async acquire(user: string, workspace: string, now = new Date()) {
    const keys = this.keys(user, workspace, now),
      lease = randomUUID(),
      resets = quotaResets(now);
    let result: unknown;
    try {
      result = await quotaCommand(
        this.client.eval(
          reserve,
          10,
          ...keys,
          now.getTime(),
          lease,
          this.limits.userDaily,
          this.limits.userMonthly,
          this.limits.workspaceDaily,
          this.limits.workspaceMonthly,
          this.limits.userConcurrent,
          this.limits.workspaceConcurrent,
          resets.daily.getTime(),
          resets.monthly.getTime(),
        ),
      );
    } catch {
      logger.warn({ event: 'ai_quota_storage_error', count: 1 });
      throw new AppError('AI quota service unavailable; no provider request started', 503);
    }
    if (!Array.isArray(result) || result.length !== 2 || !Number.isInteger(Number(result[0])))
      throw new AppError('AI quota service unavailable; no provider request started', 503);
    const index = Number(result[0]);
    if (index !== 0) {
      if (index < 1 || index > 6 || !Number.isFinite(Number(result[1])))
        throw new AppError('Invalid quota response', 503);
      const error = new AiLimitError(index, new Date(Number(result[1])), now);
      logger.info({
        event: 'ai_limit_rejected',
        count: 1,
        scope: error.limit.scope,
        period: error.limit.period,
      });
      throw error;
    }
    logger.info({ event: 'ai_reservation_admitted', count: 1 });
    return async (refund = false) => {
      const changed = await quotaCommand(
        this.client.eval(settle, 10, ...keys, lease, refund ? '1' : '0'),
      );
      if (Number(changed) === 1)
        logger.info({
          event: refund ? 'ai_reservation_refunded' : 'ai_reservation_settled',
          count: 1,
        });
    };
  }
  /** Legacy cumulative admissions DTO is retained without altering its counters. */
  async usage(user: string, workspace: string, now = new Date()) {
    const values = await quotaCommand(
      this.client.mget(...this.keys(user, workspace, now).slice(0, 4)),
    );
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
  async chargedUsage(user: string, workspace: string, now = new Date()) {
    const keys = this.keys(user, workspace, now),
      values = await quotaCommand(this.client.mget(...keys.slice(6), ...keys.slice(0, 4))),
      resets = quotaResets(now);
    const number = (i: number) => Number(values[i] ?? values[i + 4] ?? 0);
    return {
      unit: 'charged reservations' as const,
      period: 'UTC calendar day/month' as const,
      userScope: 'global account' as const,
      settlement:
        'Pre-provider and explicit pre-admission failures are refunded; ambiguous or partial attempts remain charged.' as const,
      resets: { daily: resets.daily.toISOString(), monthly: resets.monthly.toISOString() },
      concurrency: {
        userLimit: this.limits.userConcurrent,
        workspaceLimit: this.limits.workspaceConcurrent,
      },
      user: {
        daily: number(0),
        monthly: number(1),
        dailyLimit: this.limits.userDaily,
        monthlyLimit: this.limits.userMonthly,
      },
      workspace: {
        daily: number(2),
        monthly: number(3),
        dailyLimit: this.limits.workspaceDaily,
        monthlyLimit: this.limits.workspaceMonthly,
      },
    };
  }
}
