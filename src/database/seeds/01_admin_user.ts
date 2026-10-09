import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { PasswordUtil } from '@/common/utils/password.util';

export async function seed(knex: Knex): Promise<void> {
  const email = 'admin@example.com';
  const userId = randomUUID();

  await knex('users').where({ email }).del();
  await knex('users').insert({
    id: userId,
    email,
    password: await PasswordUtil.hash(
      process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
    ),
    fullName: 'Admin',
    isActive: true,
  });

  const adminRole = await knex('roles').where({ name: 'admin' }).first('id');
  if (adminRole) {
    await knex('user_roles')
      .insert({ userId, roleId: adminRole.id })
      .onConflict(['userId', 'roleId'])
      .ignore();
  }
}
