import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@/modules/rbac/interfaces/permission.interface';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const Can = (action: string, resource: string) =>
  Permissions({ action, resource });
