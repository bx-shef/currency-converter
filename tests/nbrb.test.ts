import { describe, expect, it } from 'vitest'
import { mergeRates, parseNbrbRates } from '../app/utils/nbrb'
import type { NbrbRate, RateEntry } from '../app/utils/nbrb'

/** Builds a raw НБ РБ record with sensible defaults, overridable per field. */
function rate(overrides: Partial<NbrbRate> = {}): NbrbRate {
  return {
    Cur_ID: 1,
    Date: '2026-06-03T00:00:00',
    Cur_Abbreviation: 'USD',
    Cur_Scale: 1,
    Cur_Name: 'Доллар США',
    Cur_OfficialRate: 3.2,
    ...overrides
  }
}

describe('parseNbrbRates', () => {
  it('maps code and divides the official rate by the scale', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_OfficialRate: 3.2 }),
      rate({ Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_OfficialRate: 3.5 })
    ])
    expect(result).toEqual([
      { code: 'USD', bynRate: 3.2 },
      { code: 'RUB', bynRate: 0.035 }
    ])
  })

  it('divides by scale with float-precision tolerance', () => {
    const [entry] = parseNbrbRates([rate({ Cur_Scale: 100, Cur_OfficialRate: 1.1 })])
    expect(entry?.bynRate).toBeCloseTo(0.011, 12)
  })

  it('normalises a Cur_Scale of 1000 (e.g. KZT) to a per-unit rate', () => {
    const [entry] = parseNbrbRates([
      rate({ Cur_Abbreviation: 'KZT', Cur_Scale: 1000, Cur_OfficialRate: 5.7234 })
    ])
    expect(entry?.code).toBe('KZT')
    expect(entry?.bynRate).toBeCloseTo(0.0057234, 10)
  })

  it('skips records with a non-positive scale', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD', Cur_Scale: 1 }),
      rate({ Cur_Abbreviation: 'BAD', Cur_Scale: 0 }),
      rate({ Cur_Abbreviation: 'NEG', Cur_Scale: -1 })
    ])
    expect(result.map(r => r.code)).toEqual(['USD'])
  })

  it('skips records with a non-positive official rate', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD', Cur_OfficialRate: 3.2 }),
      rate({ Cur_Abbreviation: 'ZERO', Cur_OfficialRate: 0 }),
      rate({ Cur_Abbreviation: 'NEG', Cur_OfficialRate: -5 })
    ])
    expect(result.map(r => r.code)).toEqual(['USD'])
  })

  it('skips records with non-finite scale or rate', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD' }),
      rate({ Cur_Abbreviation: 'INFR', Cur_OfficialRate: Infinity }),
      rate({ Cur_Abbreviation: 'INFS', Cur_Scale: Infinity }),
      rate({ Cur_Abbreviation: 'NANR', Cur_OfficialRate: NaN }),
      rate({ Cur_Abbreviation: 'NANS', Cur_Scale: NaN })
    ])
    expect(result.map(r => r.code)).toEqual(['USD'])
  })

  it('does not coerce string numbers (a string scale/rate is dropped)', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'STRS', Cur_Scale: '1' as unknown as number }),
      rate({ Cur_Abbreviation: 'STRR', Cur_OfficialRate: '3.2' as unknown as number })
    ])
    expect(result).toEqual([])
  })

  it('skips records with a missing or non-string code', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD' }),
      rate({ Cur_Abbreviation: undefined as unknown as string }),
      { Cur_ID: 9, Date: '', Cur_Scale: 1, Cur_Name: '', Cur_OfficialRate: 2 } as unknown as NbrbRate
    ])
    expect(result.map(r => r.code)).toEqual(['USD'])
  })

  it('preserves source order of valid entries', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'EUR' }),
      rate({ Cur_Abbreviation: 'BAD', Cur_OfficialRate: 0 }),
      rate({ Cur_Abbreviation: 'CNY' })
    ])
    expect(result.map(r => r.code)).toEqual(['EUR', 'CNY'])
  })

  it('keeps duplicate codes (de-duplication is the caller’s concern)', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'USD', Cur_OfficialRate: 3.2 }),
      rate({ Cur_Abbreviation: 'USD', Cur_OfficialRate: 3.3 })
    ])
    expect(result).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(parseNbrbRates([])).toEqual([])
  })

  it('returns an empty array for a non-array payload (e.g. error body)', () => {
    expect(parseNbrbRates(null)).toEqual([])
    expect(parseNbrbRates(undefined)).toEqual([])
    expect(parseNbrbRates({ error: 'boom' })).toEqual([])
    expect(parseNbrbRates('not-json')).toEqual([])
  })
})

describe('mergeRates', () => {
  const daily: RateEntry[] = [{ code: 'USD', bynRate: 3.2 }, { code: 'EUR', bynRate: 3.5 }]
  const monthly: RateEntry[] = [{ code: 'RSD', bynRate: 0.028 }, { code: 'USD', bynRate: 9.99 }]

  it('appends fallback-only codes (e.g. RSD) after the primary entries', () => {
    expect(mergeRates(daily, monthly)).toEqual([
      { code: 'USD', bynRate: 3.2 },
      { code: 'EUR', bynRate: 3.5 },
      { code: 'RSD', bynRate: 0.028 }
    ])
  })

  it('keeps the primary (daily) rate when a code exists in both feeds', () => {
    // USD is in both; the daily 3.2 must win over the monthly 9.99.
    expect(mergeRates(daily, monthly).find(e => e.code === 'USD')?.bynRate).toBe(3.2)
  })

  it('preserves primary source order, then fallback source order', () => {
    const primary: RateEntry[] = [{ code: 'A', bynRate: 1 }, { code: 'B', bynRate: 2 }]
    const fallback: RateEntry[] = [{ code: 'C', bynRate: 3 }, { code: 'A', bynRate: 9 }, { code: 'D', bynRate: 4 }]
    expect(mergeRates(primary, fallback).map(e => e.code)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('returns the fallback unchanged when the primary is empty', () => {
    expect(mergeRates([], monthly)).toEqual(monthly)
  })

  it('returns the primary unchanged when the fallback is empty', () => {
    expect(mergeRates(daily, [])).toEqual(daily)
  })
})
