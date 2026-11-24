import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT } from '../app/config/currencies'
import { formatAmount, toKopecks } from '../app/utils/formatters'
import { minskToday, NbrbApi, NbrbUnavailable, type FetchJson } from '../server/lib/mcp/nbrbApi'
import { MCP_TOOLS, McpTools } from '../server/lib/mcp/tools'

// 2026-11-20 12:00 Minsk = 09:00 UTC.
const NOW = Date.parse('2026-11-20T09:00:00Z')

const rec = (id: number, code: string, scale: number, rate: number, date: string, name = code) =>
  ({ Cur_ID: id, Date: `${date}T00:00:00`, Cur_Abbreviation: code, Cur_Scale: scale, Cur_Name: name, Cur_OfficialRate: rate })
const daily = (date: string) => [
  rec(431, 'USD', 1, 2.9943, date, 'Доллар США'),
  rec(451, 'EUR', 1, 3.4521, date, 'Евро'),
  rec(456, 'RUB', 100, 3.7123, date, 'Российских рублей'),
  rec(459, 'KZT', 1000, 5.9, date)
]
const monthly = (date: string) => [rec(496, 'RSD', 100, 2.9, date)]
// `/currencies`: each currency is a chain of ids under one Cur_ParentID (real ids, api.nbrb.by).
const seg = (id: number, parent: number, code: string, scale: number, per: number, start: string, end: string) =>
  ({ Cur_ID: id, Cur_ParentID: parent, Cur_Abbreviation: code, Cur_Name: code, Cur_Scale: scale, Cur_Periodicity: per, Cur_DateStart: `${start}T00:00:00`, Cur_DateEnd: `${end}T00:00:00` })
const CURRENCIES = [
  seg(145, 145, 'USD', 1, 0, '1991-01-01', '2021-07-08'), seg(431, 145, 'USD', 1, 0, '2021-07-09', '2050-01-01'),
  seg(222, 174, 'KZT', 1, 0, '2007-12-01', '2016-06-30'), seg(301, 174, 'KZT', 1000, 0, '2016-07-01', '2021-07-08'),
  seg(459, 174, 'KZT', 1000, 0, '2021-07-09', '2050-01-01'),
  seg(496, 245, 'RSD', 100, 1, '2021-07-09', '2050-01-01')
]
const DYNAMICS: Record<number, [string, number][]> = {
  145: [['2021-07-07', 2.51], ['2021-07-08', 2.52]],
  431: [['2026-11-20', 2.9943], ['2021-07-09', 2.53], ['2026-11-18', 2.9987], ['2026-11-19', 2.995]],
  301: [['2021-07-08', 6.0]],
  459: [['2021-07-09', 6.1]],
  496: [['2026-11-02', 2.88]]
}

function fakeApi(opts: { down?: boolean, monthlyDown?: boolean } = {}) {
  const urls: string[] = []
  const fetchJson: FetchJson = async (url) => {
    urls.push(url)
    if (opts.down) throw new TypeError('fetch failed')
    if (url.endsWith('/currencies')) return CURRENCIES
    const dyn = /dynamics\/(\d+)\?startdate=([\d-]+)&enddate=([\d-]+)/.exec(url)
    if (dyn) {
      const [, id, a, b] = dyn
      return (DYNAMICS[Number(id)] ?? []).filter(([d]) => d >= a! && d <= b!).map(([d, r]) => ({ Cur_ID: Number(id), Date: `${d}T00:00:00`, Cur_OfficialRate: r }))
    }
    const date = /ondate=(\d{4}-\d{2}-\d{2})/.exec(url)![1]!
    if (date > minskToday(NOW)) return [] // not published yet — НБ РБ answers 200 []
    if (url.includes('periodicity=1')) {
      if (opts.monthlyDown) throw new NbrbUnavailable('HTTP 503')
      return monthly(date)
    }
    return daily(date)
  }
  return { urls, tools: new McpTools(new NbrbApi(fetchJson, () => NOW), () => NOW) }
}

const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text)
const codeOf = async (p: Promise<{ _meta?: { code: string } }>) => (await p)._meta?.code

describe('manifest follows the shef.cowork rules', () => {
  type Node = { properties?: Record<string, Node>, items?: Node, type?: string, enum?: unknown, const?: unknown, maxLength?: number }
  const walk = (s: Node, visit: (node: Node) => void) => {
    visit(s)
    for (const v of Object.values(s.properties ?? {})) walk(v, visit)
    if (s.items) walk(s.items, visit)
  }
  it.each(MCP_TOOLS.map(t => [t.name, t] as const))('%s', (_name, t) => {
    expect(t.name).toMatch(/^[a-z][a-z0-9_]{1,46}$/)
    expect(t.description.length).toBeGreaterThanOrEqual(20)
    expect(t.description.length).toBeLessThanOrEqual(1000)
    expect(['read', 'write', 'delete']).toContain(t.kind)
    expect(JSON.stringify(t.input).length).toBeLessThanOrEqual(8000)
    walk(t.input as Node, (n) => {
      expect(n).not.toHaveProperty('pattern')
      expect(n).not.toHaveProperty('patternProperties')
      expect(n).not.toHaveProperty('$ref')
      if (n.type === 'string' && !n.enum && !n.const) expect(n.maxLength).toBeGreaterThan(0)
    })
    const names = Object.keys((t.input as Node).properties ?? {}).map(k => k.toLowerCase().replace(/[-_.\s]/g, ''))
    for (const banned of ['auth', 'memberid', 'portal', 'domain', 'token', 'asuser', 'runas', 'onbehalfof']) expect(names).not.toContain(banned)
  })
  it('read-only tools only', () => {
    expect(MCP_TOOLS.every(t => t.kind === 'read')).toBe(true)
  })
})

describe('app/utils used by the server stay framework-free', () => {
  it('only relative imports in modules the server imports (no vue, #imports, ~)', () => {
    for (const f of ['converter.ts', 'formatters.ts', 'numberToWords.ts', 'nbrb.ts']) {
      const src = readFileSync(join(process.cwd(), 'app/utils', f), 'utf8')
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) expect(m[1], `${f}: ${m[1]}`).toMatch(/^\.\.?\//)
    }
  })
})

describe('convert', () => {
  it('5 000 USD → BYN on today’s official rate, rounded to kopecks', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'convert', args: { amount: 5000, from: 'usd', to: 'BYN' } }))
    expect(r.result).toBe(14971.5)
    expect(r.date).toBe('2026-11-20')
    expect(r.rates).toEqual([{ rate: '1 USD = 2.9943 BYN', date: '2026-11-20', periodicity: 'daily' }])
  })
  it('cross rate goes through BYN and respects the scale (100 RUB)', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'convert', args: { amount: 100, from: 'USD', to: 'RUB' } }))
    // 100 × 2.9943 / (3.7123 / 100) = 8065.8893… → 8065.89
    expect(r.result).toBe(8065.89)
  })
  it('result, resultText and say agree, all through toKopecks', async () => {
    for (const amount of [0.005, 1.005, 2.675, 8.165, 123456.789]) {
      const r = data(await fakeApi().tools.run({ tool: 'convert', args: { amount, from: 'EUR', to: 'KZT' } }))
      expect(r.result).toBe(toKopecks(r.result) / 100)
      expect(r.resultText).toBe(`${formatAmount(r.result)} KZT`)
      expect(r.say).toContain(formatAmount(r.result))
    }
  })
  it('kopeck goes the same path as the converter screen (deliberately, not the exact product)', async () => {
    // 10 BYN → RUB at 3.7210 per 100: exact 268.74496… → 268.74, the screen path (4-decimal grid → toKopecks) gives
    // 268.75. The tool must equal the screen; "fixing" it to the exact product would split page and agent by a kopeck.
    const api = new NbrbApi(async url => (url.includes('periodicity=1') ? monthly('2026-11-20') : [rec(456, 'RUB', 100, 3.721, '2026-11-20')]), () => NOW)
    const r = data(await new McpTools(api, () => NOW).run({ tool: 'convert', args: { amount: 10, from: 'BYN', to: 'RUB' } }))
    expect(r.result).toBe(268.75)
  })
  it('an empty monthly feed is not complete: a monthly-only currency is unavailable, not unknown', async () => {
    const api = new NbrbApi(async url => (url.includes('periodicity=1') ? [] : daily('2026-11-20')), () => NOW)
    expect(await codeOf(new McpTools(api, () => NOW).run({ tool: 'convert', args: { amount: 1, from: 'RSD', to: 'BYN' } }))).toBe('rates_unavailable')
  })
  it('0 and MAX_AMOUNT', async () => {
    const { tools } = fakeApi()
    expect(data(await tools.run({ tool: 'convert', args: { amount: 0, from: 'USD', to: 'BYN' } })).result).toBe(0)
    expect(data(await tools.run({ tool: 'convert', args: { amount: MAX_AMOUNT, from: 'BYN', to: 'BYN' } })).result).toBe(MAX_AMOUNT)
  })
  it('a result beyond exact kopecks is refused, not rounded silently', async () => {
    expect(await codeOf(fakeApi().tools.run({ tool: 'convert', args: { amount: MAX_AMOUNT, from: 'USD', to: 'KZT' } }))).toBe('bad_args')
  })
  it('asks НБ РБ for the requested date', async () => {
    const api = fakeApi()
    const r = data(await api.tools.run({ tool: 'convert', args: { amount: 1, from: 'EUR', to: 'BYN', date: '2026-11-19' } }))
    expect(r.date).toBe('2026-11-19')
    expect(api.urls.some(u => u.includes('ondate=2026-11-19&periodicity=0'))).toBe(true)
  })
  it('monthly-only currency is found via the monthly feed', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'convert', args: { amount: 100, from: 'RSD', to: 'BYN' } }))
    expect(r.result).toBe(2.9)
    expect(r.rates[0].periodicity).toBe('monthly')
  })
  it('monthly feed down: a monthly-only currency is "unavailable", not "unknown"; nothing cached', async () => {
    const api = fakeApi({ monthlyDown: true })
    expect(await codeOf(api.tools.run({ tool: 'convert', args: { amount: 100, from: 'RSD', to: 'BYN' } }))).toBe('rates_unavailable')
    const before = api.urls.length
    await api.tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN' } })
    expect(api.urls.length).toBeGreaterThan(before)
  })
  it('BYN → BYN needs no network', async () => {
    const api = fakeApi()
    expect(data(await api.tools.run({ tool: 'convert', args: { amount: 10, from: 'BYN', to: 'BYN' } })).result).toBe(10)
    expect(api.urls).toEqual([])
  })
  it('bad arguments are tool errors, not exceptions', async () => {
    const { tools } = fakeApi()
    for (const args of [
      { amount: -1, from: 'USD', to: 'BYN' },
      { amount: MAX_AMOUNT + 1, from: 'USD', to: 'BYN' },
      { amount: Number.NaN, from: 'USD', to: 'BYN' },
      { amount: '100', from: 'USD', to: 'BYN' },
      { amount: 1, from: 'US', to: 'BYN' },
      { amount: 1, from: 'ZZZ', to: 'BYN' },
      { amount: 1, from: 'USD', to: 'BYN', date: '2026-11-22' },
      { amount: 1, from: 'USD', to: 'BYN', date: '20.11.2026' },
      { amount: 1, from: 'USD', to: 'BYN', date: '2026-02-30' }
    ]) expect(await codeOf(tools.run({ tool: 'convert', args })), JSON.stringify(args)).toBe('bad_args')
  })
  it('rates before the 2016 redenomination (BYR) are never served as BYN', async () => {
    const api = fakeApi()
    const r = await api.tools.run({ tool: 'convert', args: { amount: 100, from: 'USD', to: 'BYN', date: '2015-06-01' } })
    expect(r._meta?.code).toBe('bad_args')
    expect(r.content[0]!.text).toContain('BYR')
    expect(api.urls).toEqual([])
    expect(await codeOf(api.tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN', date: '2016-07-01' } }))).toBeUndefined()
  })
  it('tomorrow before publication is "not published yet", not an outage', async () => {
    const r = await fakeApi().tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN', date: '2026-11-21' } })
    expect(r._meta?.code).toBe('not_published')
    expect(r.content[0]!.text).toContain('21.11.2026')
  })
  it('НБ РБ down → rates_unavailable, never a made-up rate', async () => {
    expect(await codeOf(fakeApi({ down: true }).tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN' } }))).toBe('rates_unavailable')
  })
})

describe('rates', () => {
  it('chosen codes with scale; duplicates, BYN dropped; unknown codes marked, not invented', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'rates', args: { codes: ['USD', 'RUB', 'usd', 'ZZZ', 'BYN'] } }))
    expect(r.rates.map((x: { code: string }) => x.code)).toEqual(['USD', 'RUB', 'ZZZ'])
    expect(r.rates[1]).toMatchObject({ code: 'RUB', scale: 100, officialRate: 3.7123 })
    expect(r.rates[2]).toMatchObject({ code: 'ZZZ', missing: expect.any(String) })
  })
  it('no codes → the default set', async () => {
    for (const args of [{}, { codes: [] }]) {
      const r = data(await fakeApi().tools.run({ tool: 'rates', args }))
      expect(r.rates.map((x: { code: string }) => x.code)).toEqual(['USD', 'EUR', 'RUB', 'CNY', 'KZT', 'PLN'])
    }
  })
  it('a non-string code is bad_args', async () => {
    expect(await codeOf(fakeApi().tools.run({ tool: 'rates', args: { codes: ['USD', 5] } }))).toBe('bad_args')
  })
})

describe('history', () => {
  it('points sorted by date, per-unit change, min and max', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'USD', from: '2026-11-18', to: '2026-11-20' } }))
    expect(r.points.map((p: { date: string }) => p.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20'])
    expect(r.changePerUnit).toBe(-0.0044)
    expect(r.minPerUnit).toBe(2.9943)
    expect(r.maxPerUnit).toBe(2.9987)
  })
  it('is stitched across a Cur_ID change (USD 145 → 431 on 2021-07-09)', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'USD', from: '2021-07-01', to: '2021-07-31' } }))
    expect(r.points.map((p: { date: string }) => p.date)).toEqual(['2021-07-07', '2021-07-08', '2021-07-09'])
  })
  it('uses each segment’s own scale (KZT 1000 after 2016)', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'KZT', from: '2021-07-01', to: '2021-07-31' } }))
    expect(r.points).toEqual([
      { date: '2021-07-08', scale: 1000, officialRate: 6, bynPerUnit: 0.006 },
      { date: '2021-07-09', scale: 1000, officialRate: 6.1, bynPerUnit: 0.0061 }
    ])
  })
  it('a period that starts before the first point says so', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'USD', from: '2026-11-15', to: '2026-11-20' } }))
    expect(r.say).toContain('18.11.2026')
  })
  it('monthly-only currency: empty inside a month, explained', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'RSD', from: '2026-11-10', to: '2026-11-20' } }))
    expect(r.points).toEqual([])
    expect(r).not.toHaveProperty('changePerUnit')
    expect(r.say).toContain('раз в месяц')
  })
  it('range, order, from, BYN, BYR and unknown codes are validated', async () => {
    const { tools } = fakeApi()
    for (const args of [
      { code: 'USD', from: '2025-01-01', to: '2026-11-20' },
      { code: 'USD', from: '2026-11-20', to: '2026-11-18' },
      { code: 'USD', to: '2026-11-20' },
      { code: 'BYN', from: '2026-11-01' },
      { code: 'USD', from: '2016-06-01', to: '2016-07-31' },
      { code: 'ZZZ', from: '2026-11-01' }
    ]) expect(await codeOf(tools.run({ tool: 'history', args })), JSON.stringify(args)).toBe('bad_args')
  })
})

describe('sum_in_words', () => {
  it('payment-order style, capitalised, kopecks as digits', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'sum_in_words', args: { amount: 123.45, currency: 'BYN' } }))
    expect(r.words).toBe('Сто двадцать три рубля 45 копеек')
  })
  it('kopeck rounding goes through toKopecks (8.165 → 17 kopecks)', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'sum_in_words', args: { amount: 8.165, currency: 'RUB' } }))
    expect(r.amount).toBe(8.17)
    expect(r.words).toBe('Восемь рублей 17 копеек')
  })
  it('zero', async () => {
    expect(data(await fakeApi().tools.run({ tool: 'sum_in_words', args: { amount: 0, currency: 'BYN' } })).words).toBe('Ноль рублей 00 копеек')
  })
  it('only BYN and RUB, upper case', async () => {
    for (const currency of ['USD', 'byn']) expect(await codeOf(fakeApi().tools.run({ tool: 'sum_in_words', args: { amount: 1, currency } }))).toBe('bad_args')
  })
})

describe('run', () => {
  it('unknown tool', async () => {
    expect(await codeOf(fakeApi().tools.run({ tool: 'nope', args: {} }))).toBe('unknown_tool')
  })
  it('Minsk calendar: 20:59 UTC is still today, 21:00 UTC is tomorrow', () => {
    expect(minskToday(Date.parse('2026-11-20T20:59:59Z'))).toBe('2026-11-20')
    expect(minskToday(Date.parse('2026-11-20T21:00:00Z'))).toBe('2026-11-21')
  })
})

describe('NbrbApi cache', () => {
  it('one request per date; concurrent misses share it', async () => {
    const api = fakeApi()
    await Promise.all([1, 2, 3].map(() => api.tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN' } })))
    await api.tools.run({ tool: 'convert', args: { amount: 2, from: 'EUR', to: 'BYN' } })
    expect(api.urls.filter(u => u.includes('periodicity=0'))).toHaveLength(1)
  })
  it('a failure is not cached', async () => {
    let down = true
    const api = new NbrbApi(async (url) => {
      if (down) throw new TypeError('x')
      return url.includes('periodicity=1') ? [] : daily('2026-11-20')
    }, () => NOW)
    await expect(api.ratesOn('2026-11-20')).rejects.toBeInstanceOf(NbrbUnavailable)
    down = false
    expect((await api.ratesOn('2026-11-20')).rates.get('USD')?.bynRate).toBe(2.9943)
  })
})
