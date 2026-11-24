import { isUsableRate, type NbrbRate } from '../../../app/utils/nbrb'

// Server-side НБ РБ client for the MCP tools: official rates on a date (daily feed merged with the monthly
// one — some currencies, e.g. RSD, are published monthly only) and a rate history. Cached in process memory:
// a published past date never changes, today's rates may still be refreshed. No portal tokens involved.

const API = 'https://api.nbrb.by/exrates'
const TIMEOUT_MS = 5000
/** Past dates are final; today/tomorrow may be (re)published during the day. */
const TTL_PAST_MS = 24 * 3600_000
const TTL_RECENT_MS = 30 * 60_000
/** Longest history range, days (inclusive). */
export const HISTORY_MAX_DAYS = 366
const CACHE_MAX = 400

export interface OfficialRate {
  code: string
  name: string
  /** НБ РБ internal id (needed for the history endpoint). */
  curId: number
  /** Units the official rate is quoted for (100 RUB, 1000 KZT…). */
  scale: number
  /** BYN per `scale` units, as published. */
  officialRate: number
  /** BYN per ONE unit. */
  bynRate: number
  /** Date of the published rate, YYYY-MM-DD. */
  date: string
  periodicity: 'daily' | 'monthly'
}

export interface HistoryPoint { date: string, officialRate: number, bynRate: number }

export class NbrbUnavailable extends Error {}

export type FetchJson = (url: string, signal: AbortSignal) => Promise<unknown>

const defaultFetchJson: FetchJson = async (url, signal) => {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!r.ok) throw new NbrbUnavailable(`HTTP ${r.status}`)
  return r.json()
}

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

/** YYYY-MM-DD of `now` in Minsk (UTC+3, no DST) — the calendar НБ РБ publishes rates for. */
export function minskToday(now: number = Date.now()): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function toOfficial(r: NbrbRate & { Cur_ID?: unknown, Date?: unknown }, periodicity: OfficialRate['periodicity']): OfficialRate | null {
  if (!isUsableRate(r) || typeof r.Cur_ID !== 'number' || typeof r.Date !== 'string') return null
  return {
    code: r.Cur_Abbreviation.toUpperCase(),
    name: typeof r.Cur_Name === 'string' ? r.Cur_Name : r.Cur_Abbreviation,
    curId: r.Cur_ID,
    scale: r.Cur_Scale,
    officialRate: r.Cur_OfficialRate,
    bynRate: r.Cur_OfficialRate / r.Cur_Scale,
    date: r.Date.slice(0, 10),
    periodicity
  }
}

export class NbrbApi {
  private readonly cache = new Map<string, { at: number, value: unknown }>()

  constructor(
    private readonly fetchJson: FetchJson = defaultFetchJson,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** All official rates on `date` (daily first; monthly-only currencies added). Throws NbrbUnavailable. */
  async ratesOn(date: string): Promise<Map<string, OfficialRate>> {
    return this.cached(`rates:${date}`, date, async () => {
      const [daily, monthly] = await Promise.allSettled([
        this.get(`${API}/rates?ondate=${date}&periodicity=0`),
        this.get(`${API}/rates?ondate=${date}&periodicity=1`)
      ])
      if (daily.status === 'rejected') throw new NbrbUnavailable('daily feed failed')
      const out = new Map<string, OfficialRate>()
      for (const r of Array.isArray(daily.value) ? daily.value : []) {
        const o = toOfficial(r, 'daily')
        if (o) out.set(o.code, o)
      }
      if (!out.size) throw new NbrbUnavailable('daily feed empty')
      // Monthly feed is best-effort; the daily rate wins on overlap.
      if (monthly.status === 'fulfilled' && Array.isArray(monthly.value)) {
        for (const r of monthly.value) {
          const o = toOfficial(r, 'monthly')
          if (o && !out.has(o.code)) out.set(o.code, o)
        }
      }
      return out
    })
  }

  /** Daily official rate of one currency over [from, to]. Throws NbrbUnavailable, or RangeError for an unknown code. */
  async history(code: string, from: string, to: string): Promise<{ rate: OfficialRate, points: HistoryPoint[] }> {
    const rate = (await this.ratesOn(to)).get(code)
    if (!rate) throw new RangeError(code)
    const points = await this.cached(`hist:${rate.curId}:${from}:${to}`, to, async () => {
      const data = await this.get(`${API}/rates/dynamics/${rate.curId}?startdate=${from}&enddate=${to}`)
      if (!Array.isArray(data)) throw new NbrbUnavailable('bad dynamics')
      return (data as { Date?: unknown, Cur_OfficialRate?: unknown }[])
        .filter((p): p is { Date: string, Cur_OfficialRate: number } => !!p && typeof p.Date === 'string'
          && typeof p.Cur_OfficialRate === 'number' && Number.isFinite(p.Cur_OfficialRate) && p.Cur_OfficialRate > 0)
        .map((p): HistoryPoint => ({ date: p.Date.slice(0, 10), officialRate: p.Cur_OfficialRate, bynRate: p.Cur_OfficialRate / rate.scale }))
    })
    return { rate, points }
  }

  private async get(url: string): Promise<unknown> {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      return await this.fetchJson(url, ctl.signal)
    } catch (e) {
      throw e instanceof NbrbUnavailable ? e : new NbrbUnavailable(e instanceof Error ? e.name : 'fetch failed')
    } finally {
      clearTimeout(t)
    }
  }

  private async cached<T>(key: string, date: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    const ttl = daysBetween(date, minskToday(this.now())) >= 1 ? TTL_PAST_MS : TTL_RECENT_MS
    if (hit && this.now() - hit.at < ttl) return hit.value as T
    const value = await load()
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(key, { at: this.now(), value })
    return value
  }
}
