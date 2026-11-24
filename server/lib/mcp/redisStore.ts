import type { KvStore } from './store'

// KvStore on Redis: JSON values with EX; putIfAbsent is a single atomic `SET … NX EX` — the one-time nonce
// relies on it (protocol.ts takeNonce). Redis is reached only inside the compose network.

/** The subset of ioredis this store uses — lets tests pass a fake. */
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ex: 'EX', ttl: number, nx?: 'NX'): Promise<unknown>
  del(key: string): Promise<unknown>
}

export class RedisStore implements KvStore {
  constructor(private readonly r: RedisLike, private readonly prefix = 'cc:') {}

  async get<T>(key: string): Promise<T | null> {
    const v = await this.r.get(this.prefix + key)
    if (v === null) return null
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }

  async put<T>(key: string, value: T, ttlSec: number): Promise<void> {
    await this.r.set(this.prefix + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec)))
  }

  async putIfAbsent<T>(key: string, value: T, ttlSec: number): Promise<boolean> {
    return (await this.r.set(this.prefix + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec)), 'NX')) === 'OK'
  }

  async del(key: string): Promise<void> {
    await this.r.del(this.prefix + key)
  }
}
