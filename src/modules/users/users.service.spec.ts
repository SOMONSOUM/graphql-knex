import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { CacheService } from '@/common/cache/cache.service';
import type { RbacService } from '@/modules/rbac/rbac.service';
import { UserNotFoundException } from '@/modules/users/exceptions/user-not-found.exception';
import type { UserRepository } from '@/modules/users/repositories/user.repository';
import { UsersService } from '@/modules/users/users.service';

describe('UsersService', () => {
  const repo = { findByIdSafe: vi.fn(), softDelete: vi.fn() };
  const rbac = { getRoleNames: vi.fn(), getPermissions: vi.fn() };
  const cache = {
    getOrSet: vi.fn(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    ),
    del: vi.fn(),
    delByPrefix: vi.fn(),
  };
  const config = { getOrThrow: vi.fn().mockReturnValue(60) };

  const service = new UsersService(
    repo as unknown as UserRepository,
    rbac as unknown as RbacService,
    cache as unknown as CacheService,
    config as unknown as ConfigService,
  );

  afterEach(() => vi.clearAllMocks());

  it('throws UserNotFoundException when the user does not exist', async () => {
    repo.findByIdSafe.mockResolvedValue(undefined);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      UserNotFoundException,
    );
  });

  it('invalidates the item and list caches after a soft delete', async () => {
    repo.softDelete.mockResolvedValue(true);
    await service.remove('abc');
    expect(cache.del).toHaveBeenCalledWith('users:one:abc');
    expect(cache.delByPrefix).toHaveBeenCalledWith('users:list:');
  });

  it('does not touch the cache when the delete matched no row', async () => {
    repo.softDelete.mockResolvedValue(false);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(
      UserNotFoundException,
    );
    expect(cache.del).not.toHaveBeenCalled();
  });
});
