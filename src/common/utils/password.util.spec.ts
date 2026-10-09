import { describe, expect, it } from 'vitest';
import { PasswordUtil } from '@/common/utils/password.util';

describe('PasswordUtil', () => {
  it('hashes with argon2id and verifies the right password only', async () => {
    const hash = await PasswordUtil.hash('S3cure-Passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await PasswordUtil.verify(hash, 'S3cure-Passw0rd')).toBe(true);
    expect(await PasswordUtil.verify(hash, 'wrong-password')).toBe(false);
  });

  it('returns false (instead of throwing) for a malformed hash', async () => {
    expect(await PasswordUtil.verify('not-a-hash', 'anything')).toBe(false);
  });
});
