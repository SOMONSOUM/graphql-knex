import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@/common/cache/redis.constants';
import { Public } from '@/common/decorators/public.decorator';
import { KnexService } from '@/database/knex.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly knex: KnexService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Do not check dependencies here, or a DB blip restarts every pod. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the database is required; Redis is optional (it is only a cache). */
  @Get('ready')
  async ready() {
    const database = await this.knex.ping();
    const redis = await this.redis
      .ping()
      .then(() => true)
      .catch(() => false);
    if (!database)
      throw new ServiceUnavailableException({
        status: 'error',
        database,
        redis,
      });
    return { status: 'ok', database, redis };
  }
}
