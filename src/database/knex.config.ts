import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import type { Knex } from 'knex';
import { mapRowKeys, toSnakeCase } from '@/database/helpers/case-converter';

const ext = __filename.endsWith('.ts') ? 'ts' : 'js';
loadEnv({ path: join(__dirname, '..', '..', '.env') });

export interface BuildKnexConfigOptions {
  url?: string;
  poolMin?: number;
  poolMax?: number;
}

export function buildKnexConfig(
  options: BuildKnexConfigOptions = {},
): Knex.Config {
  const url = new URL(options.url ?? process.env.DATABASE_URL ?? '');

  return {
    client: 'mysql2',
    connection: {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      charset: 'utf8mb4',
      timezone: 'Z', // store and read everything as UTC
      // TINYINT(1) -> boolean (keep NULL as null)
      typeCast: (field: any, next: () => unknown) => {
        if (field.type === 'TINY' && field.length === 1) {
          const raw = field.string();
          return raw === null ? null : raw === '1';
        }
        return next();
      },
    },
    pool: {
      min: options.poolMin ?? Number(process.env.DB_POOL_MIN ?? 2),
      max: options.poolMax ?? Number(process.env.DB_POOL_MAX ?? 10),
    },
    acquireConnectionTimeout: 10_000,
    migrations: {
      directory: join(__dirname, 'migrations'),
      extension: ext,
      loadExtensions: [`.${ext}`],
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: join(__dirname, 'seeds'),
      extension: ext,
      loadExtensions: [`.${ext}`],
    },
    wrapIdentifier: (value, origImpl) => origImpl(toSnakeCase(value)), // code -> SQL
    postProcessResponse: (result) => mapRowKeys(result), //               SQL  -> code
  };
}
