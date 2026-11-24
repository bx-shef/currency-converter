import { isUsableRate, type NbrbRate } from '../../../app/utils/nbrb'

// Server-side НБ РБ client for the MCP tools: official rates on a date (daily feed merged with the monthly
// one — some currencies, e.g. RSD, are published monthly only) and a rate history. Cached in process memory:
// a published past date never changes, today's rates may still be refreshed. No portal tokens involved.
//
// Two facts of the НБ РБ API this module is built around (checked against api.nbrb.by, 2026-11-24):
// - Rates before the 2016-07-01 redenomination are in BYR (10 000 BYR = 1 BYN). They are NOT BYN, so
//   nothing earlier than FIRST_BYN_DATE is served (a 1:10 000 error otherwise — «100 USD = 1 489 000 BYN»).
// - A currency's Cur_ID changes over time (2016-07-01, 2021-07-09…; sometimes with a new Cur_Scale, e.g.
//   KZT 1 → 1000). History is stitched from all ids sharing Cur_ParentID (`/currencies`), each segment
//   with its own scale; querying one id would silently cut the period at the change.

const API = 'https://api.nbrb.by/exrates'
const TIMEOUT_MS = 5000
/** Past dates are final; today/tomorrow may be (re)published during the day. */
const TTL_PAST_MS = 24 * 3600_000
const TTL_RECENT_MS = 30 * 60_000
/** Longest history range, days (inclusive). */
export const HISTORY_MAX_DAYS = 366
/** First date with rates in BYN (redenomination 1:10 000). */
export const FIRST_BYN_DATE = '2016-07-01'
const CACHE_MAX = 400
/**
 * Requests to api.nbrb.by per minute from this server, all callers together. Cache misses are driven by the
 * callers (new dates, new periods): without a ceiling a key holder could turn us into an amplifier and get our
 * address blocked at НБ РБ for everybody. Over it — NbrbUnavailable («try again in a minute»).
 */
export const UPSTREAM_PER_MINUTE = 120
/** …and per caller (portal): one key holder can't spend everybody's budget (security review of #207, Н5). */
export const UPSTREAM_PER_CALLER_MINUTE = 20
/** `/currencies` changes rarely, but a mass Cur_ID reissue must not hide new segments for a whole day. */
const TTL_CURRENCIES_MS = 6 * 3600_000

export interface OfficialRate {
  code: string
  name: string
  /** НБ РБ internal id on this date. */
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

export interface RatesOnDate {
  rates: Map<string, OfficialRate>
  /** False when the monthly feed failed: a currency missing from `rates` may still have a monthly rate. */
  complete: boolean
}

export interface HistoryPoint { date: string, scale: number, officialRate: number, bynRate: number }

export interface History {
  code: string
  name: string
  periodicity: 'daily' | 'monthly'
  /** True when the periodicity changed inside the period (e.g. BRL monthly → daily on 2022-08-01). */
  mixedPeriodicity: boolean
  points: HistoryPoint[]
}

export class NbrbUnavailable extends Error {}
/** НБ РБ answered, but has no rates for this date yet (e.g. tomorrow, before publication). */
export class NotPublished extends Error {}

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

const minDate = (a: string, b: string) => (a < b ? a : b)
const maxDate = (a: string, b: string) => (a > b ? a : b)

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

/** One id of a currency over time (from `/currencies`). */
interface Segment { id: number, parent: number, code: string, name: string, scale: number, monthly: boolean, start: string, end: string }

function toSegment(c: Record<string, unknown>): Segment | null {
  const { Cur_ID: id, Cur_ParentID: parent, Cur_Abbreviation: code, Cur_Name: name, Cur_Scale: scale, Cur_Periodicity: per, Cur_DateStart: start, Cur_DateEnd: end } = c
  if (typeof id !== 'number' || typeof parent !== 'number' || typeof code !== 'string' || typeof scale !== 'number' || !(scale > 0)
    || typeof start !== 'string' || typeof end !== 'string') return null
  return { id, parent, code: code.toUpperCase(), name: typeof name === 'string' ? name : code, scale, monthly: per === 1, start: start.slice(0, 10), end: end.slice(0, 10) }
}

export class NbrbApi {
  private readonly cache = new Map<string, { at: number, value: unknown }>()
  /** Loads in flight by cache key: concurrent misses on one key share one request to НБ РБ. */
  private readonly inflight = new Map<string, Promise<unknown>>()
  private window = { n: 0, until: 0 }
  private readonly callers = new Map<string, { n: number, until: number }>()

  constructor(
    private readonly fetchJson: FetchJson = defaultFetchJson,
    private readonly now: () => number = () => Date.now()
  ) {}

  /**
   * All official rates on `date` (daily first; monthly-only currencies added). Throws NbrbUnavailable when the
   * daily feed fails, NotPublished when НБ РБ has no rates for that date yet. A result without the monthly feed
   * is not cached, so the next call retries it.
   */
  async ratesOn(date: string, caller?: string): Promise<RatesOnDate> {
    return this.cached(`rates:${date}`, date, async () => {
      // Both feeds or none: on the last unit of the share the daily feed alone would answer without the
      // monthly-only currencies (RSD).
      if (caller) this.spend(caller, 2)
      const [daily, monthly] = await Promise.allSettled([
        this.get(`${API}/rates?ondate=${date}&periodicity=0`),
        this.get(`${API}/rates?ondate=${date}&periodicity=1`)
      ])
      if (daily.status === 'rejected') throw daily.reason
      if (!Array.isArray(daily.value)) throw new NbrbUnavailable('bad daily feed')
      const rates = new Map<string, OfficialRate>()
      for (const r of daily.value) {
        const o = toOfficial(r, 'daily')
        if (o) rates.set(o.code, o)
      }
      if (!rates.size) {
        // An empty answer for a future date means "not published yet", not an outage.
        if (date > minskToday(this.now())) throw new NotPublished(date)
        throw new NbrbUnavailable('daily feed empty')
      }
      // An empty monthly feed (e.g. not yet published on the 1st) is not "complete" either.
      const complete = monthly.status === 'fulfilled' && Array.isArray(monthly.value) && monthly.value.length > 0
      if (complete) {
        for (const r of monthly.value as unknown[]) {
          const o = toOfficial(r as NbrbRate, 'monthly')
          if (o && !rates.has(o.code)) rates.set(o.code, o)
        }
      }
      return { rates, complete }
    }, v => v.complete)
  }

  /**
   * Official rate of one currency over [from, to] (from ≥ FIRST_BYN_DATE), stitched across its ids. Throws
   * RangeError for a currency НБ РБ does not rate, NbrbUnavailable on failures.
   */
  async history(code: string, from: string, to: string, caller?: string): Promise<History> {
    const all = await this.cached('currencies', '0000-01-01', async () => {
      const data = await this.get(`${API}/currencies`, caller)
      if (!Array.isArray(data)) throw new NbrbUnavailable('bad currencies')
      return data.map(c => (c && typeof c === 'object' ? toSegment(c as Record<string, unknown>) : null)).filter((s): s is Segment => s !== null)
    })
    const latest = all.filter(s => s.code === code && s.start <= to).sort((a, b) => b.start.localeCompare(a.start))[0]
    if (!latest) throw new RangeError(code)
    const segments = all
      .filter(s => s.parent === latest.parent && s.start <= to && s.end >= from)
      .sort((a, b) => a.start.localeCompare(b.start))
    const parts = await Promise.all(segments.map(async (s) => {
      const a = maxDate(from, s.start)
      const b = minDate(to, s.end)
      const data = await this.cached(`dyn:${s.id}:${a}:${b}`, b, () => this.get(`${API}/rates/dynamics/${s.id}?startdate=${a}&enddate=${b}`, caller))
      if (!Array.isArray(data)) throw new NbrbUnavailable('bad dynamics')
      return (data as { Date?: unknown, Cur_OfficialRate?: unknown }[])
        .filter((p): p is { Date: string, Cur_OfficialRate: number } => !!p && typeof p.Date === 'string'
          && typeof p.Cur_OfficialRate === 'number' && Number.isFinite(p.Cur_OfficialRate) && p.Cur_OfficialRate > 0)
        .map((p): HistoryPoint => ({ date: p.Date.slice(0, 10), scale: s.scale, officialRate: p.Cur_OfficialRate, bynRate: p.Cur_OfficialRate / s.scale }))
    }))
    const points = parts.flat().sort((x, y) => x.date.localeCompare(y.date))
    return {
      code: latest.code,
      name: latest.name,
      periodicity: latest.monthly ? 'monthly' : 'daily',
      mixedPeriodicity: new Set(segments.map(s => s.monthly)).size > 1,
      points
    }
  }

  /** Take `n` requests from the caller's share for this minute — all or nothing (NbrbUnavailable). */
  private spend(caller: string, n: number) {
    const now = this.now()
    let w = this.callers.get(caller)
    if (!w || w.until <= now) {
      if (this.callers.size > 5000) for (const [k, v] of this.callers) if (v.until <= now) this.callers.delete(k)
      w = { n: 0, until: now + 60_000 }
      this.callers.set(caller, w)
    }
    if (w.n + n > UPSTREAM_PER_CALLER_MINUTE) throw new NbrbUnavailable('caller limit')
    w.n += n
  }

  /** One request to НБ РБ: within the caller's share and the total ceiling, otherwise NbrbUnavailable. */
  private async get(url: string, caller?: string): Promise<unknown> {
    const now = this.now()
    if (caller) this.spend(caller, 1)
    if (this.window.until <= now) this.window = { n: 0, until: now + 60_000 }
    if (++this.window.n > UPSTREAM_PER_MINUTE) throw new NbrbUnavailable('upstream limit')
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

  /** Cache by key; `date` picks the TTL (past — 24 h, recent — 30 min); `keep` decides whether a result is cached. */
  private async cached<T>(key: string, date: string, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
    const hit = this.cache.get(key)
    const ttl = key === 'currencies' ? TTL_CURRENCIES_MS : daysBetween(date, minskToday(this.now())) >= 1 ? TTL_PAST_MS : TTL_RECENT_MS
    if (hit && this.now() - hit.at < ttl) return hit.value as T
    const running = this.inflight.get(key)
    if (running) return running as Promise<T>
    const p = load().then((value) => {
      if (keep(value)) {
        if (!this.cache.has(key) && this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string)
        this.cache.set(key, { at: this.now(), value })
      }
      return value
    }).finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }
}
