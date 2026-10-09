import { Global, Module } from '@nestjs/common';
import { CacheService } from '@/common/cache/cache.service';
import { NoopCacheService } from '@/common/cache/noop-cache.service';
import { REDIS_CLIENT } from '@/common/cache/redis.constants';

const disabledRedisClient = {
  ping: async () => {
    throw new Error('Redis is disabled');
  },
};

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, useValue: disabledRedisClient },
    { provide: CacheService, useClass: NoopCacheService },
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class NoopCacheModule {}
