import type { BaseRow } from '@/common/interfaces/base-row.interface';
import type { Permission } from '@/modules/rbac/interfaces/permission.interface';

export interface UserRow extends BaseRow {
  email: string;
  password: string;
  fullName: string | null;
  isActive: boolean;
}

/** What may leave the service layer: no password hash, no soft-delete marker. */
export type SafeUser = Omit<UserRow, 'password' | 'deletedAt'> & {
  roles: string[];
  permissions: Permission[];
};

export function toSafeUser(
  row: UserRow,
  roles: string[] = [],
  permissions: Permission[] = [],
): SafeUser {
  const { password: _password, deletedAt: _deletedAt, ...safe } = row;
  return { ...safe, roles, permissions };
}
