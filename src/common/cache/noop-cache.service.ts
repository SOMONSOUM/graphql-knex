import { Injectable } from '@nestjs/common';

@Injectable()
export class NoopCacheService {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  async set(
    _key: string,
    _value: unknown,
    _ttlSeconds: number,
  ): Promise<void> {}

  async del(..._keys: string[]): Promise<void> {}

  async delByPrefix(_prefix: string): Promise<void> {}

  async getOrSet<T>(
    _key: string,
    _ttlSeconds: number,
    loader: () => Promise<T | null>,
  ): Promise<T | null> {
    return loader();
  }

  async setIfAbsent(_key: string, _ttlSeconds: number): Promise<boolean> {
    return true;
  }
}
