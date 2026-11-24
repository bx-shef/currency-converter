/**
 * Rate history for the chat widget's 30-day mini chart (pure functions).
 * НБ РБ: `GET /exrates/rates/{code}?parammode=2` gives the current Cur_ID and Cur_Scale,
 * `GET /exrates/rates/dynamics/{Cur_ID}?startdate&enddate` the daily rates (without the scale).
 */

/**
 * Loaded histories by currency code for the page's lifetime: the chart component is re-created (v-if on rates
 * reload, switching to BYN) and must not fetch the same history again.
 */
export const historyCache = new Map<string, RatePoint[]>()

/** Days shown in the mini chart. */
export const HISTORY_DAYS = 30

export interface RatePoint {
  /** YYYY-MM-DD */
  date: string
  /** BYN per ONE unit. */
  perUnit: number
}

/** `{ Cur_ID, Cur_Scale }` from the single-rate answer, or null when unusable. */
export function parseRateRef(data: unknown): { id: number, scale: number } | null {
  if (!data || typeof data !== 'object') return null
  const { Cur_ID: id, Cur_Scale: scale } = data as Record<string, unknown>
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && typeof scale === 'number' && Number.isFinite(scale) && scale > 0
    ? { id, scale }
    : null
}

/** Dynamics answer → points per unit, sorted by date; unusable entries dropped. */
export function parseDynamics(data: unknown, scale: number): RatePoint[] {
  if (!Array.isArray(data) || !(scale > 0)) return []
  return data
    .filter((p): p is { Date: string, Cur_OfficialRate: number } => !!p && typeof p.Date === 'string'
      && typeof p.Cur_OfficialRate === 'number' && Number.isFinite(p.Cur_OfficialRate) && p.Cur_OfficialRate > 0)
    .map(p => ({ date: p.Date.slice(0, 10), perUnit: p.Cur_OfficialRate / scale }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** [from, to] for the last `days` days ending on `today` (YYYY-MM-DD, inclusive). */
export function historyRange(today: string, days: number = HISTORY_DAYS): { from: string, to: string } {
  const to = new Date(`${today}T00:00:00Z`)
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)
  return { from: from.toISOString().slice(0, 10), to: today }
}

export interface HistorySummary {
  first: number
  last: number
  min: number
  max: number
  /** (last − first) / first × 100, two decimals. */
  changePct: number
}

export function summarize(points: readonly RatePoint[]): HistorySummary | null {
  if (!points.length) return null
  const v = points.map(p => p.perUnit)
  const first = v[0]!
  const last = v[v.length - 1]!
  return { first, last, min: Math.min(...v), max: Math.max(...v), changePct: Math.round(((last - first) / first) * 10_000) / 100 }
}

/**
 * SVG path `d` of a polyline through the values, scaled into a `width × height` box with `pad` px inside.
 * A flat series is drawn in the middle; fewer than two points — empty string.
 */
export function sparklinePath(values: readonly number[], width: number, height: number, pad = 2): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = (width - 2 * pad) / (values.length - 1)
  const y = (v: number) => (span === 0 ? height / 2 : pad + (height - 2 * pad) * (1 - (v - min) / span))
  return values.map((v, i) => `${i ? 'L' : 'M'}${(pad + i * stepX).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
}

/**
 * Units to quote a rate for so the BYN figure reads well: 1, 10, 100… — the smallest that makes it ≥ 1 BYN
 * (1 USD = 2,99 BYN; 1000 KZT = 5,90 BYN), at most 100 000.
 */
export function quoteUnits(perUnit: number): number {
  if (!(perUnit > 0) || !Number.isFinite(perUnit)) return 1
  let units = 1
  while (units * perUnit < 1 && units < 100_000) units *= 10
  return units
}
