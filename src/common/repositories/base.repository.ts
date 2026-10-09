import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { KnexService } from '@/database/knex.service';
import type { BaseRow } from '@/common/interfaces/base-row.interface';

export type CreateInput<T extends BaseRow> = Omit<T, keyof BaseRow>;
export type UpdateInput<T extends BaseRow> = Partial<Omit<T, keyof BaseRow>>;

export interface QueryOptions {
  /** Include soft-deleted rows. Default: false. */
  withTrashed?: boolean;
}

export abstract class BaseRepository<T extends BaseRow> {
  protected abstract readonly table: string;

  constructor(protected readonly knexService: KnexService) {}

  protected get db(): Knex {
    return this.knexService.db;
  }

  /** The transaction if one was passed, otherwise the shared pool. */
  protected conn(trx?: Knex.Transaction): Knex {
    return trx ?? this.db;
  }

  /** ALWAYS start reads from qb(), not from db(table). Excludes soft-deleted rows by default. */
  protected qb(
    trx?: Knex.Transaction,
    options: QueryOptions = {},
  ): Knex.QueryBuilder {
    const query = this.conn(trx)(this.table);
    return options.withTrashed
      ? query
      : query.whereNull(`${this.table}.deletedAt`);
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<T | undefined> {
    return this.qb(trx).where({ id }).first();
  }

  async create(data: CreateInput<T>, trx?: Knex.Transaction): Promise<T> {
    const id = randomUUID();
    await this.conn(trx)(this.table).insert({ id, ...data });
    // Re-read inside the same transaction so the uncommitted row is visible.
    return (await this.findById(id, trx)) as T;
  }

  async update(
    id: string,
    data: UpdateInput<T>,
    trx?: Knex.Transaction,
  ): Promise<T | undefined> {
    await this.qb(trx).where({ id }).update(data); // updated_at refreshed by MySQL
    return this.findById(id, trx);
  }

  /** Returns false if the row did not exist or was already deleted. */
  async softDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.qb(trx)
      .where({ id })
      .update({ deletedAt: new Date() });
    return affected > 0;
  }

  async restore(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.qb(trx, { withTrashed: true })
      .where({ id })
      .whereNotNull('deletedAt')
      .update({ deletedAt: null });
    return affected > 0;
  }

  /** Permanent delete. Use sparingly (retention jobs, tests). */
  async hardDelete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const affected = await this.conn(trx)(this.table).where({ id }).del();
    return affected > 0;
  }
}
