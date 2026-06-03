import { describe, expect, it } from 'vitest'
import { parseNbrbRates } from '../app/utils/nbrb'
import type { NbrbRate } from '../app/utils/nbrb'

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

  it('preserves source order of valid entries', () => {
    const result = parseNbrbRates([
      rate({ Cur_Abbreviation: 'EUR' }),
      rate({ Cur_Abbreviation: 'BAD', Cur_OfficialRate: 0 }),
      rate({ Cur_Abbreviation: 'CNY' })
    ])
    expect(result.map(r => r.code)).toEqual(['EUR', 'CNY'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseNbrbRates([])).toEqual([])
  })

  it('returns an empty array for a non-array payload (e.g. error body)', () => {
    expect(parseNbrbRates(null as unknown as NbrbRate[])).toEqual([])
    expect(parseNbrbRates({ error: 'boom' } as unknown as NbrbRate[])).toEqual([])
  })
})
