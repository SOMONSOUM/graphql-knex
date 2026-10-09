import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { Permission } from '@/modules/rbac/interfaces/permission.interface';
import { RbacRepository } from '@/modules/rbac/repositories/rbac.repository';

@Injectable()
export class RbacService {
  constructor(private readonly rbac: RbacRepository) {}

  assignRole(
    userId: string,
    roleName: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    return this.rbac.assignRole(userId, roleName, trx);
  }

  getRoleNames(userId: string, trx?: Knex.Transaction): Promise<string[]> {
    return this.rbac.getRoleNames(userId, trx);
  }

  getPermissions(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<Permission[]> {
    return this.rbac.getPermissions(userId, trx);
  }
}
