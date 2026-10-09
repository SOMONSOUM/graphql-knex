import type { BaseRow } from '@/common/interfaces/base-row.interface';

export interface RefreshTokenRow extends BaseRow {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  userAgent: string | null;
}
