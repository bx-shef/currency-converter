/**
 * localStorage cache for НБ РБ rates — pure validation/serialisation helpers.
 * No `localStorage` access here: `now` is injected so the TTL check is
 * deterministic and the whole module is directly unit-testable. The thin
 * storage read/write lives in the composable that uses these.
 */
import type { RateEntry } from './nbrb'

/** Cached payload shape persisted to localStorage. */
export interface CachedRates {
  date: string
  rates: RateEntry[]
  timestamp: number
}

/**
 * Versioned key: bump the suffix on any {@link CachedRates} shape change to
 * drop stale caches written by an older build.
 */
export const CACHE_KEY = 'nbrb_rates_v1'

/** НБ РБ updates rates once per business day; cache for 12 hours. */
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** Structural guard against a foreign/older cache shape. */
function isCachedRates(value: unknown): value is CachedRates {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  // A missing `timestamp` would make the TTL check `NaN > TTL` (false) and
  // apply broken data — reject the whole record instead.
  // Bound the date length: it is shown to the user, and an unbounded string
  // from tampered localStorage should not reach the UI even as plain text.
  return typeof c.timestamp === 'number'
    && typeof c.date === 'string' && c.date.length <= 32
    && Array.isArray(c.rates)
}

/** Drops tampered/corrupt entries so conversion never sees a bad rate. */
function isUsableEntry(entry: unknown): entry is RateEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const r = entry as Record<string, unknown>
  return typeof r.code === 'string' && r.code !== ''
    && typeof r.bynRate === 'number' && Number.isFinite(r.bynRate) && r.bynRate > 0
}

/**
 * Validates and normalises a raw cached payload.
 *
 * @returns the usable cache, or `null` when it is missing, unparsable, of a
 *   foreign shape, expired, or contains no valid rate entries.
 */
export function parseCache(raw: string | null, now: number, ttlMs: number = CACHE_TTL_MS): CachedRates | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isCachedRates(parsed)) return null
  if (now - parsed.timestamp > ttlMs) return null
  const rates = parsed.rates.filter(isUsableEntry)
  if (!rates.length) return null
  return { date: parsed.date, rates, timestamp: parsed.timestamp }
}

/** Serialises rates for storage, stamping the current time. */
export function serializeCache(date: string, rates: RateEntry[], now: number): string {
  return JSON.stringify({ date, rates, timestamp: now } satisfies CachedRates)
}
