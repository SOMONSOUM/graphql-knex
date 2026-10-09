import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  HOST: Joi.string().default('localhost'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .optional(),
  GRAPHQL_SANDBOX_ENABLED: Joi.boolean().default(false),
  CORS_ORIGINS: Joi.string().allow('').optional(),

  DATABASE_URL: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      try {
        const url = new URL(value);
        return ['mysql:', 'mysql2:'].includes(url.protocol)
          ? value
          : helpers.error('any.invalid');
      } catch {
        return helpers.error('any.invalid');
      }
    }, 'MySQL database URL'),
  DB_POOL_MIN: Joi.number().min(0).default(2),
  DB_POOL_MAX: Joi.number().min(1).default(10),
  KNEX_DEBUG: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET')),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  CACHE_TTL_SECONDS: Joi.number().min(1).default(60),

  KAFKA_ENABLED: Joi.boolean().default(false),
  KAFKA_BROKERS: Joi.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: Joi.string().default('my-api'),
  KAFKA_CONSUMER_GROUP_ID: Joi.string().default('my-api-consumers'),
  KAFKA_SSL: Joi.boolean().default(false),
  KAFKA_SASL_MECHANISM: Joi.string()
    .valid('plain', 'scram-sha-256', 'scram-sha-512')
    .allow('')
    .optional(),
  KAFKA_SASL_USERNAME: Joi.string().allow('').optional(),
  KAFKA_SASL_PASSWORD: Joi.string().allow('').optional(),
});
