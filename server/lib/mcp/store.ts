// Minimal key-value store with expiry. The server wires a Redis-backed implementation; tests and
// single-process development use MemoryStore. Expiry is checked on read, so drivers without TTL work too.

export interface KvStore {
  get<T>(key: string): Promise<T | null>
  put<T>(key: string, value: T, ttlSec: number): Promise<void>
  del(key: string): Promise<void>
}

export class MemoryStore implements KvStore {
  private readonly m = new Map<string, { v: unknown, exp: number }>()
  constructor(private readonly now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | null> {
    const b = this.m.get(key)
    if (!b) return null
    if (b.exp <= this.now()) {
      this.m.delete(key)
      return null
    }
    return b.v as T
  }

  async put<T>(key: string, value: T, ttlSec: number): Promise<void> {
    this.m.set(key, { v: value, exp: this.now() + ttlSec * 1000 })
  }

  async del(key: string): Promise<void> {
    this.m.delete(key)
  }
}

const tails = new Map<string, Promise<unknown>>()

/** In-process lock by key: the server runs as one Node process, so get+put under it equals SET NX. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  tails.set(key, run)
  try {
    return await run
  } finally {
    if (tails.get(key) === run) tails.delete(key)
  }
}
