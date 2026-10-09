import type { Knex } from 'knex';
import { addBaseColumns } from '@/database/helpers/base-columns';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (table) => {
    addBaseColumns(knex, table);
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('token_hash', 191).notNullable().unique(); // sha256 hex of the token, never the token
    table.datetime('expires_at', { precision: 3 }).notNullable();
    table.boolean('revoked').notNullable().defaultTo(false);
    table.string('user_agent');
    table.index(['user_id']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
