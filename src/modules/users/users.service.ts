import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '@/common/cache/cache.service';
import type { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { PasswordUtil } from '@/common/utils/password.util';
import { RbacService } from '@/modules/rbac/rbac.service';
import { CreateUserInput } from '@/modules/users/dto/create-user.input';
import { ListUsersArgs } from '@/modules/users/dto/list-users.args';
import { UpdateUserInput } from '@/modules/users/dto/update-user.input';
import type { SafeUser, UserRow } from '@/modules/users/entities/user.entity';
import { EmailAlreadyExistsException } from '@/modules/users/exceptions/email-already-exists.exception';
import { UserNotFoundException } from '@/modules/users/exceptions/user-not-found.exception';
import { UserRepository } from '@/modules/users/repositories/user.repository';

const KEY_ONE = (id: string) => `users:one:${id}`;
const KEY_LIST = (suffix: string) => `users:list:${suffix}`;
const PREFIX_LIST = 'users:list:';

@Injectable()
export class UsersService {
  private readonly ttl: number;

  constructor(
    private readonly users: UserRepository,
    private readonly rbac: RbacService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    this.ttl = config.getOrThrow<number>('redis.ttlSeconds');
  }

  async findAll(query: ListUsersArgs): Promise<PaginatedResult<SafeUser>> {
    return this.cache.getOrSet(KEY_LIST(query.cacheKey), this.ttl, async () => {
      const result = await this.users.paginateUsers(query);
      return {
        ...result,
        data: await Promise.all(
          result.data.map((user) => this.attachAccess(user)),
        ),
      };
    }) as Promise<PaginatedResult<SafeUser>>;
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.cache.getOrSet<SafeUser>(
      KEY_ONE(id),
      this.ttl,
      async () => {
        const user = await this.users.findByIdSafe(id);
        return user ? this.attachAccess(user) : null; // null is never cached
      },
    );
    if (!user) throw new UserNotFoundException();
    return user;
  }

  async create(input: CreateUserInput): Promise<SafeUser> {
    if (await this.users.existsByEmail(input.email))
      throw new EmailAlreadyExistsException();

    const row = await this.users.create({
      email: input.email,
      password: await PasswordUtil.hash(input.password),
      fullName: input.fullName ?? null,
      isActive: true,
    });
    await this.rbac.assignRole(row.id, 'user');

    await this.cache.delByPrefix(PREFIX_LIST);
    return this.attachAccess(row);
  }

  async update(id: string, input: UpdateUserInput): Promise<SafeUser> {
    const updated = await this.users.update(id, { fullName: input.fullName });
    if (!updated) throw new UserNotFoundException();
    await this.invalidate(id);
    return this.attachAccess(updated);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.users.softDelete(id);
    if (!deleted) throw new UserNotFoundException();
    await this.invalidate(id);
  }

  /** For authentication only (includes the password hash). */
  findByEmailWithPassword(email: string): Promise<UserRow | undefined> {
    return this.users.findByEmail(email);
  }

  /** Uncached, used by token refresh where freshness matters. */
  findEntityById(id: string): Promise<UserRow | undefined> {
    return this.users.findById(id);
  }

  private async invalidate(id: string): Promise<void> {
    await Promise.all([
      this.cache.del(KEY_ONE(id)),
      this.cache.delByPrefix(PREFIX_LIST),
    ]);
  }

  private async attachAccess(
    user: Omit<UserRow, 'password' | 'deletedAt'>,
  ): Promise<SafeUser> {
    const [roles, permissions] = await Promise.all([
      this.rbac.getRoleNames(user.id),
      this.rbac.getPermissions(user.id),
    ]);
    return { ...user, roles, permissions };
  }
}
