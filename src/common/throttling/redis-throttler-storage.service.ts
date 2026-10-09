import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import type { Redis } from 'ioredis';

export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;
    const expiresAt = now + ttl;

    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtl / 1000),
      };
    }

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(hitsKey, '0', String(now));
    pipeline.zadd(hitsKey, String(expiresAt), `${now}:${Math.random()}`);
    pipeline.pexpire(hitsKey, ttl);
    pipeline.zcard(hitsKey);
    pipeline.zrange(hitsKey, '0', '0', 'WITHSCORES');
    const results = await pipeline.exec();

    const totalHits = Number(results?.[3]?.[1] ?? 0);
    const oldest = results?.[4]?.[1] as string[] | undefined;
    const oldestExpiresAt = oldest?.[1] ? Number(oldest[1]) : expiresAt;
    const timeToExpire = Math.max(1, Math.ceil((oldestExpiresAt - now) / 1000));

    if (totalHits > limit && blockDuration > 0) {
      await this.redis.psetex(blockKey, blockDuration, '1');
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: totalHits > limit,
      timeToBlockExpire: 0,
    };
  }
}
