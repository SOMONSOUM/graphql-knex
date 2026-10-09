import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from '@/database/knex.service';
import { BaseRepository } from '@/common/repositories/base.repository';
import type { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { buildPaginationMeta } from '@/common/utils/pagination.util';
import { ListUsersArgs } from '@/modules/users/dto/list-users.args';
import type { UserRow } from '@/modules/users/entities/user.entity';

const SAFE_COLUMNS = [
  'id',
  'email',
  'fullName',
  'isActive',
  'createdAt',
  'updatedAt',
];
const SORTABLE_COLUMNS = ['createdAt', 'updatedAt', 'email', 'fullName'];
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class UserRepository extends BaseRepository<UserRow> {
  protected readonly table = 'users';

  constructor(knexService: KnexService) {
    super(knexService);
  }

  /** Includes the password hash: authentication only. */
  async findByEmail(
    email: string,
    trx?: Knex.Transaction,
  ): Promise<UserRow | undefined> {
    return this.qb(trx).where({ email }).first();
  }

  /** Includes soft-deleted rows: the UNIQUE index still covers them (see §5.4). */
  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.qb(undefined, { withTrashed: true })
      .where({ email })
      .first('id');
    return !!row;
  }

  async findByIdSafe(
    id: string,
  ): Promise<Omit<UserRow, 'password' | 'deletedAt'> | undefined> {
    return this.qb().select(SAFE_COLUMNS).where({ id }).first();
  }

  async paginateUsers(
    query: ListUsersArgs,
  ): Promise<PaginatedResult<Omit<UserRow, 'password' | 'deletedAt'>>> {
    const applyFilters = (builder: Knex.QueryBuilder): Knex.QueryBuilder => {
      if (query.search) {
        const like = `%${escapeLike(query.search)}%`;
        builder.where((group) =>
          group.where('email', 'like', like).orWhere('fullName', 'like', like),
        );
      }
      if (query.isActive !== undefined)
        builder.where('isActive', query.isActive);
      return builder;
    };

    const sortBy = SORTABLE_COLUMNS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';

    const [rows, countRow] = await Promise.all([
      applyFilters(this.qb())
        .select(SAFE_COLUMNS)
        .orderBy([
          { column: sortBy, order: query.sqlSortOrder },
          { column: 'id', order: 'asc' }, // tie-breaker -> stable pages
        ])
        .limit(query.limit)
        .offset(query.skip),
      applyFilters(this.qb()).count({ total: '*' }).first(),
    ]);

    const total = Number(
      (countRow as { total: number | string } | undefined)?.total ?? 0,
    );
    return {
      data: rows as Omit<UserRow, 'password' | 'deletedAt'>[],
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }
}
