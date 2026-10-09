import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { ForbiddenException } from '@/common/exceptions/http.exceptions';
import { getRequest } from '@/common/utils/context.util';
import type { JwtPayload } from '@/modules/auth/interfaces/jwt-payload.interface';
import type { Permission } from '@/modules/rbac/interfaces/permission.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'rpc') return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length && !requiredPermissions?.length) return true;

    const user = getRequest(context).user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    const hasRole =
      !requiredRoles?.length ||
      requiredRoles.some((role) => user.roles.includes(role));
    const hasPermission =
      !requiredPermissions?.length ||
      requiredPermissions.every((permission) =>
        user.permissions.some(
          (owned) =>
            owned.action === permission.action &&
            (owned.resource === permission.resource || owned.resource === '*'),
        ),
      );

    if (!hasRole || !hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
