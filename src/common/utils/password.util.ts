import * as argon2 from 'argon2';
import type { HashOptions } from 'argon2';

// OWASP-recommended argon2id baseline (19 MiB, 2 iterations, 1 lane). Benchmark on your hardware
// and raise memory/time until hashing takes roughly 100-300 ms.
const OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class PasswordUtil {
  static hash(plain: string): Promise<string> {
    return argon2.hash(plain, { ...OPTIONS, raw: false });
  }

  static async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // malformed hash
    }
  }

  /** True when the stored hash was made with weaker parameters and should be re-hashed on login. */
  static needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
