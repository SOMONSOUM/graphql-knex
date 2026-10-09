import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from '@/common/cache/cache.service';
import { REDIS_CLIENT } from '@/common/cache/redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('Redis');
        const redis = new Redis({
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          password: config.get<string | undefined>('redis.password'),
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
          commandTimeout: 1_000, // a slow Redis must not make requests slow
          retryStrategy: (times: number) => Math.min(times * 200, 5_000),
        });
        redis.on('error', (err: Error) => logger.error(err.message)); // without a listener, errors are fatal
        redis.on('ready', () => logger.log('Redis ready'));
        return redis;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisCacheModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
