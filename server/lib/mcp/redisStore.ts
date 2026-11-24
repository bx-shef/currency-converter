import type { KvStore } from './store'

// KvStore on Redis: JSON values with EX; putIfAbsent is a single atomic `SET … NX EX` — the one-time nonce
// relies on it (protocol.ts takeNonce). Redis is reached only inside the compose network. Any Redis failure
// becomes StoreUnavailable, which the routes answer with 503 + Retry-After (not 500): the site keeps working,
// shef.cowork retries later.

/** The subset of ioredis this store uses — lets tests pass a fake. */
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ex: 'EX', ttl: number, nx?: 'NX'): Promise<unknown>
  del(key: string): Promise<unknown>
}

/** The store (Redis) did not answer or refused a write (e.g. maxmemory). */
export class StoreUnavailable extends Error {}

async function guarded<T>(p: () => Promise<T>): Promise<T> {
  try {
    return await p()
  } catch (e) {
    throw new StoreUnavailable(e instanceof Error ? e.name : 'store error')
  }
}

export class RedisStore implements KvStore {
  constructor(private readonly r: RedisLike, private readonly prefix = 'cc:') {}

  async get<T>(key: string): Promise<T | null> {
    const v = await guarded(() => this.r.get(this.prefix + key))
    if (v === null) return null
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }

  async put<T>(key: string, value: T, ttlSec: number): Promise<void> {
    await guarded(() => this.r.set(this.prefix + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec))))
  }

  async putIfAbsent<T>(key: string, value: T, ttlSec: number): Promise<boolean> {
    return (await guarded(() => this.r.set(this.prefix + key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec)), 'NX'))) === 'OK'
  }

  async del(key: string): Promise<void> {
    await guarded(() => this.r.del(this.prefix + key))
  }
}
