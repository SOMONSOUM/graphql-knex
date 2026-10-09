import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from '@/database/knex.service';
import { BaseRepository } from '@/common/repositories/base.repository';
import type { RefreshTokenRow } from '@/modules/auth/entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenRow> {
  protected readonly table = 'refresh_tokens';

  constructor(knexService: KnexService) {
    super(knexService);
  }

  /**
   * Any state (valid, revoked, expired). Inside a transaction the row is locked
   * (SELECT ... FOR UPDATE) so two concurrent refreshes with the same token cannot both win.
   */
  async findByHash(
    tokenHash: string,
    trx?: Knex.Transaction,
  ): Promise<RefreshTokenRow | undefined> {
    const query = this.qb(trx).where({ tokenHash }).first();
    if (trx) query.forUpdate();
    return query;
  }

  async revoke(id: string, trx?: Knex.Transaction): Promise<void> {
    await this.qb(trx).where({ id }).update({ revoked: true });
  }

  /** Logout: revoke only the caller's own token. */
  async revokeByHash(tokenHash: string, userId: string): Promise<void> {
    await this.qb().where({ tokenHash, userId }).update({ revoked: true });
  }

  async revokeAllForUser(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    await this.qb(trx)
      .where({ userId, revoked: false })
      .update({ revoked: true });
  }

  async findActiveByUserIds(
    userIds: readonly string[],
  ): Promise<RefreshTokenRow[]> {
    if (userIds.length === 0) return [];

    return this.qb()
      .whereIn('userId', [...userIds])
      .where({ revoked: false })
      .where('expiresAt', '>', new Date());
  }

  /** Retention job (cron / k8s CronJob): permanently remove tokens that expired before `before`. */
  async purgeExpired(before: Date = new Date()): Promise<number> {
    return this.db(this.table).where('expiresAt', '<', before).del();
  }
}
