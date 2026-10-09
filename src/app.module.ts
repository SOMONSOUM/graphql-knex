import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@/common/cache/redis.constants';
import { NoopCacheModule } from '@/common/cache/noop-cache.module';
import { RedisCacheModule } from '@/common/cache/redis-cache.module';
import { GqlThrottlerGuard } from '@/common/guards/gql-throttler.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { RedisThrottlerStorageService } from '@/common/throttling/redis-throttler-storage.service';
import configuration from '@/config/configuration';
import { validationSchema } from '@/config/validation.schema';
import { DatabaseModule } from '@/database/database.module';
import { AppGraphQLModule } from '@/graphql/graphql.module';
import { HealthModule } from '@/health/health.module';
import { KafkaModule } from '@/kafka/kafka.module';
import { NoopKafkaModule } from '@/kafka/noop-kafka.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UsersModule } from '@/modules/users/users.module';

const redisEnabled = process.env.REDIS_ENABLED === 'true';
const kafkaEnabled = process.env.KAFKA_ENABLED === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { libraryOptions: { abortEarly: true } }, // Joi settings live under libraryOptions in @nestjs/config 12
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<boolean>('isProd', false);
        return {
          pinoHttp: {
            level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie'],
              censor: '[redacted]',
            },
            genReqId: (req) =>
              (req.headers['x-request-id'] as string) ?? randomUUID(),
            autoLogging: { ignore: (req) => !!req.url?.startsWith('/health') },
          },
        };
      },
    }),
    DatabaseModule,
    redisEnabled ? RedisCacheModule : NoopCacheModule,
    kafkaEnabled ? KafkaModule : NoopKafkaModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1_000, limit: 10 },
          { name: 'medium', ttl: 10_000, limit: 50 },
          { name: 'long', ttl: 60_000, limit: 200 },
        ],
        storage: redisEnabled
          ? new RedisThrottlerStorageService(redis)
          : new ThrottlerStorageService(),
      }),
    }),
    AppGraphQLModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first (cheap), authenticate, then authorize.
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
