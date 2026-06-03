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

/** A currency code paired with its BYN-per-unit rate. */
export interface RateEntry {
  code: string
  bynRate: number
}

/**
 * Maps a raw НБ РБ API response into `{ code, bynRate }` entries.
 *
 * Records with a non-positive `Cur_Scale` *or* `Cur_OfficialRate` are skipped:
 * a zero/negative rate would otherwise land in state as `bynRate <= 0`, which
 * `convert()` treats as "not loaded" and renders the currency blank. Filtering
 * here keeps such records out entirely instead of relying on that downstream guard.
 *
 * @param data raw API payload; a non-array (e.g. an error body) yields `[]`.
 * @returns valid rate entries, in source order.
 */
export function parseNbrbRates(data: NbrbRate[]): RateEntry[] {
  if (!Array.isArray(data)) return []
  return data
    .filter(r => r.Cur_Scale > 0 && r.Cur_OfficialRate > 0)
    .map(r => ({ code: r.Cur_Abbreviation, bynRate: r.Cur_OfficialRate / r.Cur_Scale }))
}
