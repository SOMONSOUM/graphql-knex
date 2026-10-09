export type SaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

export interface KafkaConfigShape {
  enabled: boolean;
  brokers: string[];
  clientId: string;
  groupId: string;
  ssl: boolean;
  sasl?: { mechanism: SaslMechanism; username: string; password: string };
}

export interface JwtConfigShape {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface RedisConfigShape {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  ttlSeconds: number;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? 'localhost',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  graphql: { sandboxEnabled: process.env.GRAPHQL_SANDBOX_ENABLED === 'true' },
  database: {
    url: process.env.DATABASE_URL as string,
    poolMin: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    debug: process.env.KNEX_DEBUG === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  } satisfies JwtConfigShape,
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST as string,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '60', 10),
  } satisfies RedisConfigShape,
  kafka: {
    enabled: process.env.KAFKA_ENABLED === 'true',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'my-api',
    groupId: process.env.KAFKA_CONSUMER_GROUP_ID ?? 'my-api-consumers',
    ssl: process.env.KAFKA_SSL === 'true',
    sasl: process.env.KAFKA_SASL_USERNAME
      ? {
          mechanism: (process.env.KAFKA_SASL_MECHANISM ||
            'scram-sha-512') as SaslMechanism,
          username: process.env.KAFKA_SASL_USERNAME,
          password: process.env.KAFKA_SASL_PASSWORD ?? '',
        }
      : undefined,
  } satisfies KafkaConfigShape,
});
