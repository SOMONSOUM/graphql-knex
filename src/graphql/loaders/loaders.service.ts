import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import type { RefreshTokenRow } from '@/modules/auth/entities/refresh-token.entity';
import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';

export interface Loaders {
  sessionsByUserId: DataLoader<string, RefreshTokenRow[]>;
}

@Injectable()
export class LoadersService {
  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  /** Call once per request. Never share a loader across requests: its cache would leak data between users. */
  create(): Loaders {
    return {
      sessionsByUserId: new DataLoader(async (ids) => {
        const rows = await this.refreshTokens.findActiveByUserIds(ids);
        return ids.map((id) =>
          rows.filter((row: RefreshTokenRow) => row.userId === id),
        ); // same order as `ids`
      }),
    };
  }
}
