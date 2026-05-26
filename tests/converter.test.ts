import { describe, expect, it } from 'vitest'
import { convert, roundValue, stepFor } from '../app/utils/converter'

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
  it('uses 10 for values below 200', () => {
    expect(stepFor(0)).toBe(10)
    expect(stepFor(50)).toBe(10)
    expect(stepFor(100)).toBe(10)
    expect(stepFor(199.99)).toBe(10)
  })
  it('uses 100 for values 200 and above', () => {
    expect(stepFor(200)).toBe(100)
    expect(stepFor(500)).toBe(100)
    expect(stepFor(10_000)).toBe(100)
  })
  it('falls back to 10 for undefined or non-finite', () => {
    expect(stepFor(undefined)).toBe(10)
    expect(stepFor(NaN)).toBe(10)
    expect(stepFor(Infinity)).toBe(10)
  })
  it('treats absolute value (negatives same as positives)', () => {
    expect(stepFor(-50)).toBe(10)
    expect(stepFor(-300)).toBe(100)
  })
})
