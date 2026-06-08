import { describe, expect, it } from 'vitest'
import { createCurrencyRows, DEFAULT_AMOUNT, DEFAULT_CURRENCIES, MAX_AMOUNT } from '../app/config/currencies'

describe('DEFAULT_CURRENCIES', () => {
  it('lists the expected currencies in display order', () => {
    expect(DEFAULT_CURRENCIES.map(c => c.code)).toEqual(['BYN', 'RUB', 'KZT', 'CNY', 'TRY', 'USD', 'EUR'])
  })

  it('puts BYN first, then RUB', () => {
    const codes = DEFAULT_CURRENCIES.map(c => c.code)
    expect(codes[0]).toBe('BYN')
    expect(codes[1]).toBe('RUB')
  })

  it('has unique codes', () => {
    const codes = DEFAULT_CURRENCIES.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('seeds BYN as the base (rate 1, default amount) and the rest empty', () => {
    for (const c of DEFAULT_CURRENCIES) {
      if (c.code === 'BYN') {
        expect(c.bynRate).toBe(1)
        expect(c.value).toBe(DEFAULT_AMOUNT)
      } else {
        expect(c.bynRate).toBe(0)
        expect(c.value).toBeUndefined()
      }
    }
  })
})

describe('createCurrencyRows', () => {
  it('returns an independent deep copy of the defaults', () => {
    const rows = createCurrencyRows()
    // Mutate BYN — the row whose value actually changes at runtime.
    const byn = rows.find(c => c.code === 'BYN')!
    byn.value = 999
    expect(DEFAULT_CURRENCIES.find(c => c.code === 'BYN')!.value).toBe(DEFAULT_AMOUNT)
    expect(rows.map(c => c.code)).toEqual(DEFAULT_CURRENCIES.map(c => c.code))
  })
})

describe('MAX_AMOUNT', () => {
  it('keeps value × rate within the safe-integer range', () => {
    expect(MAX_AMOUNT).toBe(1e12)
    expect(MAX_AMOUNT * 1000).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })
})
