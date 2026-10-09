import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { addBaseColumns } from '@/database/helpers/base-columns';

const defaultRoles = [
  { id: randomUUID(), name: 'admin', description: 'Full system administrator' },
  { id: randomUUID(), name: 'user', description: 'Default application user' },
] as const;

const defaultPermissions = [
  { id: randomUUID(), action: '*', resource: '*', description: 'Full access' },
  {
    id: randomUUID(),
    action: 'read',
    resource: 'users',
    description: 'Read users',
  },
  {
    id: randomUUID(),
    action: 'delete',
    resource: 'users',
    description: 'Delete users',
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (table) => {
    addBaseColumns(knex, table);
    table.string('name', 100).notNullable().unique();
    table.string('description').nullable();
  });

  await knex.schema.createTable('permissions', (table) => {
    addBaseColumns(knex, table);
    table.string('action', 100).notNullable();
    table.string('resource', 100).notNullable();
    table.string('description').nullable();
    table.unique(['action', 'resource']);
  });

  await knex.schema.createTable('user_roles', (table) => {
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.createTable('role_permissions', (table) => {
    table
      .uuid('role_id')
      .notNullable()
      .references('id')
      .inTable('roles')
      .onDelete('CASCADE');
    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('permissions')
      .onDelete('CASCADE');
    table.primary(['role_id', 'permission_id']);
  });

  await knex('roles').insert(defaultRoles);
  await knex('permissions').insert(defaultPermissions);

  const adminRole = await knex('roles').where({ name: 'admin' }).first('id');
  const userRole = await knex('roles').where({ name: 'user' }).first('id');
  const allPermission = await knex('permissions')
    .where({ action: '*', resource: '*' })
    .first('id');

  await knex('role_permissions').insert({
    roleId: adminRole.id,
    permissionId: allPermission.id,
  });

  if (await knex.schema.hasColumn('users', 'role')) {
    await knex.raw(`
      INSERT IGNORE INTO user_roles (user_id, role_id)
      SELECT users.id, roles.id
      FROM users
      JOIN roles ON roles.name = users.role
      WHERE users.deleted_at IS NULL
    `);
    await knex.schema.alterTable('users', (table) => table.dropColumn('role'));
  }

  await knex.raw(
    `
    INSERT IGNORE INTO user_roles (user_id, role_id)
    SELECT users.id, ?
    FROM users
    LEFT JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.deleted_at IS NULL AND user_roles.user_id IS NULL
    `,
    [userRole.id],
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.enu('role', ['user', 'admin']).notNullable().defaultTo('user');
  });

  await knex.raw(`
    UPDATE users
    JOIN user_roles ON user_roles.user_id = users.id
    JOIN roles ON roles.id = user_roles.role_id
    SET users.role = roles.name
    WHERE roles.name IN ('user', 'admin')
  `);

  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('user_roles');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('roles');
}
