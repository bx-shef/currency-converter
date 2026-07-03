/**
 * Parsing helpers for the НБ РБ exchange-rate API (https://api.nbrb.by).
 * Pure functions, no Vue/state dependencies — directly unit-testable.
 */

/** Raw rate record returned by `GET /exrates/rates`. */
export interface NbrbRate {
  Cur_ID: number
  Date: string
  Cur_Abbreviation: string
  Cur_Scale: number
  Cur_Name: string
  Cur_OfficialRate: number
}

/** A currency code paired with its already-normalised BYN rate. */
export interface RateEntry {
  code: string
  /** BYN per ONE unit of the currency, i.e. `Cur_OfficialRate / Cur_Scale`. */
  bynRate: number
}

/**
 * Type guard for a rate record usable in the converter: a string code plus a
 * finite, strictly-positive scale and official rate.
 *
 * `Number.isFinite` (not the global `isFinite`) is intentional — it does NOT
 * coerce, so string numbers like `"1"` and non-finite `Infinity`/`NaN` are
 * rejected rather than silently producing a `0` / `Infinity` rate downstream.
 */
function isUsableRate(record: unknown): record is NbrbRate {
  if (typeof record !== 'object' || record === null) return false
  const r = record as Record<string, unknown>
  return typeof r.Cur_Abbreviation === 'string'
    && typeof r.Cur_Scale === 'number' && Number.isFinite(r.Cur_Scale) && r.Cur_Scale > 0
    && typeof r.Cur_OfficialRate === 'number' && Number.isFinite(r.Cur_OfficialRate) && r.Cur_OfficialRate > 0
}

/**
 * Maps a raw НБ РБ API response into normalised `{ code, bynRate }` entries.
 *
 * Records that are not usable (non-positive / non-finite scale or rate, missing
 * or non-string code) are dropped here, at the source — otherwise a bad rate
 * would enter state as `bynRate <= 0` / `Infinity`, which `convert()` treats as
 * "not loaded" and renders the currency blank. Duplicate codes are preserved;
 * de-duplication, if needed, is the caller's concern.
 *
 * @param data raw API payload; anything that is not an array (e.g. an HTTP
 *   error body, `null`) yields `[]`.
 * @returns valid rate entries, in source order.
 */
export function parseNbrbRates(data: unknown): RateEntry[] {
  if (!Array.isArray(data)) return []
  return data
    .filter(isUsableRate)
    .map(r => ({ code: r.Cur_Abbreviation, bynRate: r.Cur_OfficialRate / r.Cur_Scale }))
}

/**
 * Merges two rate lists by currency code, with `primary` winning on conflicts.
 *
 * НБ РБ splits its rates across two feeds: most currencies live in the daily
 * feed (`periodicity=0`), but a few — e.g. the Serbian dinar (RSD) — are
 * published only monthly (`periodicity=1`). Overlaying the daily feed
 * (`primary`) on top of the monthly one (`fallback`) keeps the fresher daily
 * rate for currencies present in both, while letting the monthly feed fill the
 * codes the daily feed never carries.
 *
 * Order: all `primary` entries first (in source order), then `fallback` entries
 * whose code is not already in `primary`.
 */
export function mergeRates(primary: RateEntry[], fallback: RateEntry[]): RateEntry[] {
  const primaryCodes = new Set(primary.map(e => e.code))
  return [...primary, ...fallback.filter(e => !primaryCodes.has(e.code))]
}
