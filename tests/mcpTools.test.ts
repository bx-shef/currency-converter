import { describe, expect, it } from 'vitest'
import { NbrbApi, NbrbUnavailable, type FetchJson } from '../server/lib/mcp/nbrbApi'
import { MCP_TOOLS, McpTools } from '../server/lib/mcp/tools'

// 2026-11-20 12:00 Minsk = 09:00 UTC.
const NOW = Date.parse('2026-11-20T09:00:00Z')

const daily = (date: string) => [
  { Cur_ID: 431, Date: `${date}T00:00:00`, Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар США', Cur_OfficialRate: 2.9943 },
  { Cur_ID: 451, Date: `${date}T00:00:00`, Cur_Abbreviation: 'EUR', Cur_Scale: 1, Cur_Name: 'Евро', Cur_OfficialRate: 3.4521 },
  { Cur_ID: 456, Date: `${date}T00:00:00`, Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_Name: 'Российских рублей', Cur_OfficialRate: 3.7123 }
]
const monthly = [{ Cur_ID: 500, Date: '2026-11-01T00:00:00', Cur_Abbreviation: 'RSD', Cur_Scale: 100, Cur_Name: 'Сербских динаров', Cur_OfficialRate: 2.9 }]

function fakeApi(opts: { down?: boolean } = {}) {
  const urls: string[] = []
  const fetchJson: FetchJson = async (url) => {
    urls.push(url)
    if (opts.down) throw new NbrbUnavailable('down')
    const date = /ondate=(\d{4}-\d{2}-\d{2})/.exec(url)?.[1] ?? '2026-11-20'
    if (url.includes('periodicity=1')) return monthly
    if (url.includes('/dynamics/431')) return [
      { Cur_ID: 431, Date: '2026-11-18T00:00:00', Cur_OfficialRate: 2.9987 },
      { Cur_ID: 431, Date: '2026-11-19T00:00:00', Cur_OfficialRate: 2.995 },
      { Cur_ID: 431, Date: '2026-11-20T00:00:00', Cur_OfficialRate: 2.9943 }
    ]
    return daily(date)
  }
  return { urls, tools: new McpTools(new NbrbApi(fetchJson, () => NOW), () => NOW) }
}

const data = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text)

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
    walk(t.input, (n) => {
      expect(n).not.toHaveProperty('pattern')
      expect(n).not.toHaveProperty('patternProperties')
      expect(n).not.toHaveProperty('$ref')
      if (n.type === 'string' && !n.enum && !n.const) expect(n.maxLength).toBeGreaterThan(0)
    })
    const names = JSON.stringify(t.input).toLowerCase()
    for (const banned of ['auth', 'member_id', 'portal', 'domain', 'token', 'asuser', 'runas', 'onbehalfof']) expect(names).not.toContain(`"${banned}"`)
  })
  it('read-only tools only', () => {
    expect(MCP_TOOLS.every(t => t.kind === 'read')).toBe(true)
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
  it('BYN → BYN needs no network', async () => {
    const api = fakeApi()
    expect(data(await api.tools.run({ tool: 'convert', args: { amount: 10, from: 'BYN', to: 'BYN' } })).result).toBe(10)
    expect(api.urls).toEqual([])
  })
  it('bad arguments are tool errors, not exceptions', async () => {
    const { tools } = fakeApi()
    for (const args of [
      { amount: -1, from: 'USD', to: 'BYN' },
      { amount: 1, from: 'US', to: 'BYN' },
      { amount: 1, from: 'XXX', to: 'BYN' },
      { amount: 1, from: 'USD', to: 'BYN', date: '2026-11-25' },
      { amount: 1, from: 'USD', to: 'BYN', date: '20.11.2026' }
    ]) {
      const r = await tools.run({ tool: 'convert', args })
      expect(r.isError).toBe(true)
      expect(r._meta?.code).toBe('bad_args')
    }
  })
  it('tomorrow’s rate is allowed (НБ РБ publishes it in the afternoon)', async () => {
    const r = await fakeApi().tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN', date: '2026-11-21' } })
    expect(r.isError).toBeUndefined()
  })
  it('НБ РБ down → rates_unavailable, never a made-up rate', async () => {
    const r = await fakeApi({ down: true }).tools.run({ tool: 'convert', args: { amount: 1, from: 'USD', to: 'BYN' } })
    expect(r._meta?.code).toBe('rates_unavailable')
  })
})

describe('rates', () => {
  it('default set, with scale; unknown codes are marked, not invented', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'rates', args: { codes: ['USD', 'RUB', 'ZZZ'] } }))
    expect(r.rates[0]).toMatchObject({ code: 'USD', scale: 1, officialRate: 2.9943 })
    expect(r.rates[1]).toMatchObject({ code: 'RUB', scale: 100, officialRate: 3.7123 })
    expect(r.rates[2]).toMatchObject({ code: 'ZZZ', missing: expect.any(String) })
  })
})

describe('history', () => {
  it('points, change, min and max', async () => {
    const r = data(await fakeApi().tools.run({ tool: 'history', args: { code: 'USD', from: '2026-11-18', to: '2026-11-20' } }))
    expect(r.points).toHaveLength(3)
    expect(r.change).toBe(-0.0044)
    expect(r.min).toBe(2.9943)
    expect(r.max).toBe(2.9987)
  })
  it('range is capped and ordered', async () => {
    const { tools } = fakeApi()
    expect((await tools.run({ tool: 'history', args: { code: 'USD', from: '2025-01-01', to: '2026-11-20' } }))._meta?.code).toBe('bad_args')
    expect((await tools.run({ tool: 'history', args: { code: 'USD', from: '2026-11-20', to: '2026-11-18' } }))._meta?.code).toBe('bad_args')
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
  it('only BYN and RUB', async () => {
    expect((await fakeApi().tools.run({ tool: 'sum_in_words', args: { amount: 1, currency: 'USD' } }))._meta?.code).toBe('bad_args')
  })
})
