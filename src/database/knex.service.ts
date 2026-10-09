import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex from 'knex';
import type { Knex } from 'knex';
import { buildKnexConfig } from '@/database/knex.config';

interface DatabaseConfig {
  url: string;
  poolMin: number;
  poolMax: number;
  debug: boolean;
}

@Injectable()
export class KnexService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnexService.name);
  readonly db: Knex;

  constructor(config: ConfigService) {
    const database = config.getOrThrow<DatabaseConfig>('database');
    this.db = knex(buildKnexConfig(database));

    if (database.debug) {
      // SQL only, never bindings (they can contain emails or password hashes).
      this.db.on('query', (query) => this.logger.debug(query.sql));
    }
  }

  async onModuleInit() {
    await this.db.raw('select 1'); // fail fast if the database is unreachable
    this.logger.log('MySQL connection established');
  }

  async onModuleDestroy() {
    await this.db.destroy();
  }

  /** Commits on resolve, rolls back on throw. */
  transaction<T>(work: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.raw('select 1');
      return true;
    } catch {
      return false;
    }
  }
}
