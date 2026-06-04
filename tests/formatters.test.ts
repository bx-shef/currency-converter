import { describe, expect, it } from 'vitest'
import { applyFormula, capitalizeFirst, FORMULA_FACTOR, formatAmount, numberFormatOptions } from '../app/utils/formatters'

describe('numberFormatOptions', () => {
  it('is plain decimal — no currency style or code', () => {
    expect(numberFormatOptions.style).toBe('decimal')
    // Regression guard: the field must NOT re-embed the currency code
    // (it lives in the left column). currency-style truncated the number.
    expect(numberFormatOptions).not.toHaveProperty('currency')
    expect(numberFormatOptions).not.toHaveProperty('currencyDisplay')
  })

  it('always shows exactly 2 fraction digits with grouping', () => {
    expect(numberFormatOptions.minimumFractionDigits).toBe(2)
    expect(numberFormatOptions.maximumFractionDigits).toBe(2)
    expect(numberFormatOptions.useGrouping).toBe(true)
  })
})

describe('formatAmount', () => {
  it('groups thousands and keeps 2 decimals, with no currency suffix', () => {
    const out = formatAmount(1234567.89)
    expect(out).toMatch(/^1\D234\D567,89$/) // ru-RU groups with a (non-breaking) space
    expect(out).not.toMatch(/BYN|RUB|₽|Br/)
  })

  it('pads and rounds to 2 fraction digits', () => {
    expect(formatAmount(7)).toBe('7,00')
    expect(formatAmount(1.234)).toBe('1,23')
    expect(formatAmount(1.236)).toBe('1,24')
    expect(formatAmount(0)).toBe('0,00')
  })

  // Contract guard for non-finite input. `convert()` already returns undefined for
  // such values, so they should never reach the field — but if that guard regresses,
  // Intl renders a non-numeric fallback (not a misleading digit string), not a crash.
  it('renders a non-numeric Intl fallback for non-finite input', () => {
    expect(formatAmount(NaN)).not.toMatch(/\d/) // "не число"
    expect(formatAmount(Infinity)).toContain('∞')
    expect(formatAmount(-Infinity)).toContain('∞')
  })
})

describe('applyFormula', () => {
  it('computes (X − 20%) × 20% ≡ X × 0.16', () => {
    expect(FORMULA_FACTOR).toBe(0.16)
    expect(applyFormula(100)).toBe(16)
    expect(applyFormula(1007.56)).toBe(161.21)
  })

  it('rounds the result to 2 decimal places', () => {
    expect(applyFormula(1)).toBe(0.16)
    expect(applyFormula(0)).toBe(0)
  })

  it('propagates non-finite input (documents current behaviour)', () => {
    expect(applyFormula(NaN)).toBeNaN()
    expect(applyFormula(Infinity)).toBe(Infinity)
    expect(applyFormula(-Infinity)).toBe(-Infinity)
  })
})

describe('capitalizeFirst', () => {
  it('upper-cases only the first character', () => {
    expect(capitalizeFirst('сто двадцать три рубля 45 копеек')).toBe('Сто двадцать три рубля 45 копеек')
    expect(capitalizeFirst('один рубль 01 копейка')).toBe('Один рубль 01 копейка')
  })

  it('leaves the rest of the string untouched', () => {
    expect(capitalizeFirst('uSD')).toBe('USD')
  })

  it('returns empty string for empty input', () => {
    expect(capitalizeFirst('')).toBe('')
  })
})
