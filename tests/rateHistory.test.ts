import { describe, expect, it } from 'vitest'
import { historyRange, parseDynamics, parseRateRef, quoteUnits, sparklinePath, summarize } from '../app/utils/rateHistory'

describe('parseRateRef', () => {
  it('Cur_ID and Cur_Scale from the single-rate answer', () => {
    expect(parseRateRef({ Cur_ID: 456, Cur_Scale: 100, Cur_OfficialRate: 3.7 })).toEqual({ id: 456, scale: 100 })
  })
  it('rejects unusable answers', () => {
    for (const bad of [null, [], 'x', { Cur_ID: '456', Cur_Scale: 1 }, { Cur_ID: 1, Cur_Scale: 0 }, { Cur_ID: 1.5, Cur_Scale: 1 }]) expect(parseRateRef(bad)).toBeNull()
  })
})

describe('parseDynamics', () => {
  it('per unit with the scale, sorted by date, junk dropped', () => {
    const data = [
      { Date: '2026-11-20T00:00:00', Cur_OfficialRate: 3.72 },
      { Date: '2026-11-19T00:00:00', Cur_OfficialRate: 3.7 },
      { Date: '2026-11-18T00:00:00', Cur_OfficialRate: 0 },
      { Cur_OfficialRate: 3 },
      null
    ]
    const pts = parseDynamics(data, 100)
    expect(pts.map(p => p.date)).toEqual(['2026-11-19', '2026-11-20'])
    expect(pts[0]!.perUnit).toBeCloseTo(0.037, 10)
    expect(pts[1]!.perUnit).toBeCloseTo(0.0372, 10)
    expect(parseDynamics('x', 1)).toEqual([])
    expect(parseDynamics(data, 0)).toEqual([])
  })
})

describe('historyRange', () => {
  it('30 days ending today, inclusive, across a month', () => {
    expect(historyRange('2026-11-24')).toEqual({ from: '2026-10-26', to: '2026-11-24' })
    expect(historyRange('2026-03-01', 2)).toEqual({ from: '2026-02-28', to: '2026-03-01' })
  })
})

describe('summarize', () => {
  it('first, last, min, max, change in percent', () => {
    expect(summarize([{ date: 'a', perUnit: 2 }, { date: 'b', perUnit: 1.5 }, { date: 'c', perUnit: 2.1 }]))
      .toEqual({ first: 2, last: 2.1, min: 1.5, max: 2.1, changePct: 5 })
    expect(summarize([])).toBeNull()
  })
})

describe('sparklinePath', () => {
  it('scales into the box: min at the bottom, max at the top', () => {
    expect(sparklinePath([1, 3, 2], 100, 20, 0)).toBe('M0.0 20.0 L50.0 0.0 L100.0 10.0')
  })
  it('flat series in the middle; one point — nothing', () => {
    expect(sparklinePath([5, 5], 10, 20, 0)).toBe('M0.0 10.0 L10.0 10.0')
    expect(sparklinePath([5], 10, 20)).toBe('')
  })
})

describe('quoteUnits', () => {
  it('smallest power of ten that gives at least 1 BYN', () => {
    expect(quoteUnits(2.9943)).toBe(1)
    expect(quoteUnits(0.037)).toBe(100)
    expect(quoteUnits(0.0059)).toBe(1000)
    expect(quoteUnits(1e-9)).toBe(100_000)
    expect(quoteUnits(0)).toBe(1)
  })
})
