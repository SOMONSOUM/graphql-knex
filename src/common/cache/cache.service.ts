import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@/common/cache/redis.constants';

const PREFIX = 'app:';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// JSON turns Dates into strings; turn them back so cached values match fresh ones.
const reviver = (_key: string, value: unknown) =>
  typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(PREFIX + key);
      return raw === null ? null : (JSON.parse(raw, reviver) as T);
    } catch (err) {
      this.logger.warn(`get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(
        PREFIX + key,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn(`set(${key}) failed: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.unlink(...keys.map((k) => PREFIX + k));
    } catch (err) {
      this.logger.warn(`del failed: ${(err as Error).message}`);
    }
  }

  /** SCAN-based (never KEYS, which blocks Redis). Fine for small key sets; use tags/versioning at scale. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.redis.scanStream({
        match: `${PREFIX}${prefix}*`,
        count: 200,
      });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) await this.redis.unlink(...keys);
      }
    } catch (err) {
      this.logger.warn(
        `delByPrefix(${prefix}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Read-through. A null result from the loader is returned but never cached. */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T | null>,
  ): Promise<T | null> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await loader();
    if (fresh !== null && fresh !== undefined)
      await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** SET NX EX. True if this caller won the key (used for consumer idempotency). Fails open. */
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (
        (await this.redis.set(PREFIX + key, '1', 'EX', ttlSeconds, 'NX')) ===
        'OK'
      );
    } catch (err) {
      this.logger.warn(`setIfAbsent(${key}) failed: ${(err as Error).message}`);
      return true;
    }
  }
}
