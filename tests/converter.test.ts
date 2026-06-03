import { describe, expect, it } from 'vitest'
import { applyStep, convert, recalcFrom, roundValue, stepFor } from '../app/utils/converter'

describe('roundValue', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundValue(1.234567)).toBe(1.2346)
    expect(roundValue(0.00001)).toBe(0)
  })

  it('preserves integers', () => {
    expect(roundValue(0)).toBe(0)
    expect(roundValue(100)).toBe(100)
    expect(roundValue(-5)).toBe(-5)
  })

  it('returns undefined for non-finite input', () => {
    expect(roundValue(NaN)).toBeUndefined()
    expect(roundValue(Infinity)).toBeUndefined()
    expect(roundValue(-Infinity)).toBeUndefined()
  })

  it('eliminates IEEE-754 noise', () => {
    expect(roundValue(0.1 + 0.2)).toBe(0.3)
  })
})

describe('convert', () => {
  it('converts via BYN-rate ratio', () => {
    // 100 USD * 3.2 BYN/USD / 3.6 BYN/EUR = 88.8889 EUR
    expect(convert(100, 3.2, 3.6)).toBe(88.8889)
  })

  it('returns the input when rates are equal', () => {
    expect(convert(50, 2.5, 2.5)).toBe(50)
  })

  it('handles BYN as source (rate=1)', () => {
    // 100 BYN -> USD at 3.2 BYN/USD = 31.25 USD
    expect(convert(100, 1, 3.2)).toBe(31.25)
  })

  it('returns undefined when source rate is missing', () => {
    expect(convert(100, 0, 3.2)).toBeUndefined()
  })

  it('returns undefined when target rate is missing', () => {
    expect(convert(100, 3.2, 0)).toBeUndefined()
  })

  it('returns undefined for negative rates', () => {
    expect(convert(100, -1, 3.2)).toBeUndefined()
    expect(convert(100, 3.2, -1)).toBeUndefined()
  })

  it('returns undefined for non-finite amount', () => {
    expect(convert(NaN, 3.2, 3.6)).toBeUndefined()
    expect(convert(Infinity, 3.2, 3.6)).toBeUndefined()
  })

  it('handles zero amount', () => {
    expect(convert(0, 3.2, 3.6)).toBe(0)
  })

  it('handles negative amount without crashing', () => {
    // Negative amounts are not blocked here — UI enforces min=0; the function is pure math.
    expect(convert(-100, 3.2, 3.6)).toBe(-88.8889)
  })
})

describe('stepFor', () => {
  it('uses 1 for values below 10', () => {
    expect(stepFor(0)).toBe(1)
    expect(stepFor(1)).toBe(1)
    expect(stepFor(5)).toBe(1)
    expect(stepFor(9.99)).toBe(1)
  })
  it('uses 10 for values from 10 to below 200', () => {
    expect(stepFor(10)).toBe(10)
    expect(stepFor(50)).toBe(10)
    expect(stepFor(100)).toBe(10)
    expect(stepFor(199.99)).toBe(10)
  })
  it('uses 100 for values 200 and above', () => {
    expect(stepFor(200)).toBe(100)
    expect(stepFor(500)).toBe(100)
    expect(stepFor(10_000)).toBe(100)
  })
  it('falls back to 1 for undefined or non-finite', () => {
    expect(stepFor(undefined)).toBe(1)
    expect(stepFor(NaN)).toBe(1)
    expect(stepFor(Infinity)).toBe(1)
    expect(stepFor(-Infinity)).toBe(1)
  })
  it('treats absolute value (negatives same as positives)', () => {
    expect(stepFor(-5)).toBe(1)
    expect(stepFor(-10)).toBe(10)
    expect(stepFor(-50)).toBe(10)
    expect(stepFor(-200)).toBe(100)
    expect(stepFor(-300)).toBe(100)
  })
})

describe('applyStep', () => {
  it('increments by 1 below 10', () => {
    expect(applyStep(0, 1)).toBe(1)
    expect(applyStep(5, 1)).toBe(6)
    expect(applyStep(9, 1)).toBe(10)
  })
  it('increments by 10 in the 10–199 range', () => {
    expect(applyStep(10, 1)).toBe(20)
    expect(applyStep(100, 1)).toBe(110)
    expect(applyStep(199, 1)).toBe(209)
  })
  it('increments by 100 at 200+', () => {
    expect(applyStep(200, 1)).toBe(300)
    expect(applyStep(500, 1)).toBe(600)
  })
  it('decrements by 1 below 10', () => {
    expect(applyStep(5, -1)).toBe(4)
    expect(applyStep(1, -1)).toBe(0)
  })
  it('decrements by 10 in the 10–199 range', () => {
    expect(applyStep(20, -1)).toBe(10)
    expect(applyStep(10, -1)).toBe(0)
  })
  it('decrements by 100 at 200+', () => {
    expect(applyStep(300, -1)).toBe(200)
    expect(applyStep(200, -1)).toBe(100)
  })
  it('treats undefined and non-finite as 0', () => {
    expect(applyStep(undefined, 1)).toBe(1)
    expect(applyStep(undefined, -1)).toBe(-1)
    expect(applyStep(NaN, 1)).toBe(1)
    expect(applyStep(Infinity, 1)).toBe(1)
  })
  it('threshold crossing: step is based on current value, not result', () => {
    // At 9, step=1 → lands on 10 (next call will use step 10)
    expect(applyStep(9, 1)).toBe(10)
    // At 199, step=10 → lands on 209 (skips 200–208)
    expect(applyStep(199, 1)).toBe(209)
  })
  it('eliminates IEEE-754 noise in result', () => {
    expect(applyStep(0.1, 1)).toBe(1.1)
  })
})

describe('recalcFrom', () => {
  const rows = [
    { code: 'BYN', bynRate: 1, value: undefined as number | undefined },
    { code: 'USD', bynRate: 3.2, value: undefined as number | undefined },
    { code: 'EUR', bynRate: 3.6, value: undefined as number | undefined }
  ]

  it('sets the source row and converts the rest', () => {
    const result = recalcFrom(rows, 'BYN', 100)
    expect(result.find(r => r.code === 'BYN')?.value).toBe(100)
    expect(result.find(r => r.code === 'USD')?.value).toBe(31.25) // 100 / 3.2
    expect(result.find(r => r.code === 'EUR')?.value).toBe(27.7778) // 100 / 3.6
  })

  it('converts from a non-BYN source', () => {
    const result = recalcFrom(rows, 'USD', 100)
    expect(result.find(r => r.code === 'USD')?.value).toBe(100)
    expect(result.find(r => r.code === 'BYN')?.value).toBe(320) // 100 * 3.2
    expect(result.find(r => r.code === 'EUR')?.value).toBe(88.8889) // 100 * 3.2 / 3.6
  })

  it('is pure — does not mutate the input rows', () => {
    const snapshot = JSON.stringify(rows)
    recalcFrom(rows, 'BYN', 50)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('leaves a row undefined when its rate is missing', () => {
    const withMissing = [
      { code: 'BYN', bynRate: 1, value: undefined as number | undefined },
      { code: 'XXX', bynRate: 0, value: undefined as number | undefined }
    ]
    const result = recalcFrom(withMissing, 'BYN', 100)
    expect(result.find(r => r.code === 'XXX')?.value).toBeUndefined()
  })

  it('copies rows unchanged when the source code is not found', () => {
    const result = recalcFrom(rows, 'GBP', 100)
    expect(result.map(r => r.value)).toEqual(rows.map(r => r.value))
    expect(result).not.toBe(rows)
  })
})
