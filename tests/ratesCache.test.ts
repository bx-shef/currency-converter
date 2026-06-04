import { describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, parseCache, serializeCache } from '../app/utils/ratesCache'
import type { RateEntry } from '../app/utils/nbrb'

const rates: RateEntry[] = [{ code: 'USD', bynRate: 3.2 }, { code: 'EUR', bynRate: 3.5 }]
const NOW = 1_000_000_000_000

/** Serialises a cache payload with sensible defaults, overridable per field. */
function raw(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ date: '04.06.2026', rates, timestamp: NOW, ...over })
}

describe('parseCache', () => {
  it('returns the cache when fresh and valid', () => {
    expect(parseCache(raw(), NOW + 1000)).toEqual({ date: '04.06.2026', rates, timestamp: NOW })
  })

  it('returns null for empty/null raw', () => {
    expect(parseCache(null, NOW)).toBeNull()
    expect(parseCache('', NOW)).toBeNull()
  })

  it('returns null for unparsable JSON', () => {
    expect(parseCache('{ not json', NOW)).toBeNull()
  })

  it('returns null for a foreign shape', () => {
    expect(parseCache(JSON.stringify({ date: 'x', rates }), NOW)).toBeNull() // no timestamp
    expect(parseCache(JSON.stringify({ rates, timestamp: NOW }), NOW)).toBeNull() // no date
    expect(parseCache(JSON.stringify({ date: 'x', timestamp: NOW, rates: 'no' }), NOW)).toBeNull()
  })

  it('returns null past the TTL but keeps the boundary', () => {
    expect(parseCache(raw(), NOW + CACHE_TTL_MS + 1)).toBeNull()
    expect(parseCache(raw(), NOW + CACHE_TTL_MS)).not.toBeNull()
  })

  it('honours a custom ttl', () => {
    expect(parseCache(raw(), NOW + 5000, 1000)).toBeNull()
  })

  it('drops corrupt rate entries and keeps the valid ones', () => {
    const mixed = JSON.stringify({
      date: 'x',
      timestamp: NOW,
      rates: [
        { code: 'USD', bynRate: 3.2 },
        { code: '', bynRate: 1 },
        { code: 'BAD', bynRate: 0 },
        { code: 'NEG', bynRate: -1 },
        { code: 'INF', bynRate: Infinity }, // → null after JSON round-trip
        { bynRate: 1 }
      ]
    })
    expect(parseCache(mixed, NOW)).toEqual({ date: 'x', timestamp: NOW, rates: [{ code: 'USD', bynRate: 3.2 }] })
  })

  it('returns null when no valid entries remain', () => {
    const allBad = JSON.stringify({ date: 'x', timestamp: NOW, rates: [{ code: 'BAD', bynRate: 0 }] })
    expect(parseCache(allBad, NOW)).toBeNull()
  })
})

describe('serializeCache', () => {
  it('round-trips through parseCache', () => {
    expect(parseCache(serializeCache('04.06.2026', rates, NOW), NOW)).toEqual({ date: '04.06.2026', rates, timestamp: NOW })
  })

  it('stamps the provided timestamp', () => {
    expect(JSON.parse(serializeCache('d', rates, 42)).timestamp).toBe(42)
  })
})
