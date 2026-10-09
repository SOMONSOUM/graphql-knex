import type { BaseRow } from '@/common/interfaces/base-row.interface';

export interface RoleRow extends BaseRow {
  name: string;
  description: string | null;
}

export interface PermissionRow extends BaseRow {
  action: string;
  resource: string;
  description: string | null;
}
