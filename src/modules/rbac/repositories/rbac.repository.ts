import { Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KnexService } from '@/database/knex.service';
import type { Permission } from '@/modules/rbac/interfaces/permission.interface';

@Injectable()
export class RbacRepository {
  constructor(private readonly knexService: KnexService) {}

  private get db(): Knex {
    return this.knexService.db;
  }

  private conn(trx?: Knex.Transaction): Knex {
    return trx ?? this.db;
  }

  async assignRole(
    userId: string,
    roleName: string,
    trx?: Knex.Transaction,
  ): Promise<void> {
    const role = await this.conn(trx)('roles')
      .where({ name: roleName })
      .whereNull('deletedAt')
      .first('id');
    if (!role) throw new Error(`Role not found: ${roleName}`);

    await this.conn(trx)('user_roles')
      .insert({ userId, roleId: role.id })
      .onConflict(['userId', 'roleId'])
      .ignore();
  }

  async getRoleNames(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<string[]> {
    const rows = await this.conn(trx)('roles')
      .join('user_roles', 'roles.id', 'user_roles.roleId')
      .where('user_roles.userId', userId)
      .whereNull('roles.deletedAt')
      .orderBy('roles.name', 'asc')
      .select<{ name: string }[]>('roles.name');

    return rows.map((row) => row.name);
  }

  async getPermissions(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<Permission[]> {
    const rows = await this.conn(trx)('permissions')
      .distinct<{ action: string; resource: string }[]>(
        'permissions.action',
        'permissions.resource',
      )
      .join(
        'role_permissions',
        'permissions.id',
        'role_permissions.permissionId',
      )
      .join('user_roles', 'role_permissions.roleId', 'user_roles.roleId')
      .join('roles', 'roles.id', 'user_roles.roleId')
      .where('user_roles.userId', userId)
      .whereNull('roles.deletedAt')
      .whereNull('permissions.deletedAt')
      .orderBy([
        { column: 'permissions.resource', order: 'asc' },
        { column: 'permissions.action', order: 'asc' },
      ]);

    return rows.map((row) => ({ action: row.action, resource: row.resource }));
  }
}
