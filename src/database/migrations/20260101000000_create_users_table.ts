import type { Knex } from 'knex';
import { addBaseColumns } from '@/database/helpers/base-columns';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    addBaseColumns(knex, table);
    table.string('email', 191).notNullable().unique();
    table.string('password').notNullable();
    table.string('full_name');
    table.boolean('is_active').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
