import type { Permission } from '@/modules/rbac/interfaces/permission.interface';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  permissions: Permission[];
}
