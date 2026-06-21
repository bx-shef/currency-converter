import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyFormula, capitalizeFirst, FORMULA_FACTOR, formatAmount, formatPlainAmount, numberFormatOptions, quarterLabel, quarterOfDate } from '../app/utils/formatters'

describe('formatPlainAmount', () => {
  it('formats with exactly 2 decimals and a dot separator', () => {
    expect(formatPlainAmount(12.3)).toBe('12.30')
    expect(formatPlainAmount(1234.5)).toBe('1234.50')
    expect(formatPlainAmount(0)).toBe('0.00')
  })

  it('rounds to 2 decimals', () => {
    expect(formatPlainAmount(12.345)).toBe('12.35')
    expect(formatPlainAmount(12.344)).toBe('12.34')
  })

  it('has no grouping separators (spreadsheet-friendly)', () => {
    expect(formatPlainAmount(1234567.89)).toBe('1234567.89')
  })

  it('handles negatives and non-finite input', () => {
    expect(formatPlainAmount(-5)).toBe('-5.00')
    expect(formatPlainAmount(NaN)).toBe('0.00')
    expect(formatPlainAmount(Infinity)).toBe('0.00')
    expect(formatPlainAmount(-Infinity)).toBe('0.00')
    expect(formatPlainAmount(-0)).toBe('0.00')
  })
})

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

  it('groups a five-digit amount (typical converted KZT range)', () => {
    expect(formatAmount(14705.5)).toMatch(/^14\D705,50$/)
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

  it('returns 0 for non-finite input so the UI never renders "NaN"', () => {
    expect(applyFormula(NaN)).toBe(0)
    expect(applyFormula(Infinity)).toBe(0)
    expect(applyFormula(-Infinity)).toBe(0)
  })
})

describe('quarterOfDate', () => {
  // Covers both edges of every quarter — an off-by-one in Math.floor(month / 3)
  // would slip a boundary month into the wrong quarter.
  it('maps each month to its calendar quarter', () => {
    expect(quarterOfDate(new Date(2026, 0, 15))).toBe(1) // January — start of Q1
    expect(quarterOfDate(new Date(2026, 2, 31))).toBe(1) // March — end of Q1
    expect(quarterOfDate(new Date(2026, 3, 1))).toBe(2) // April — start of Q2
    expect(quarterOfDate(new Date(2026, 5, 8))).toBe(2) // June — end of Q2
    expect(quarterOfDate(new Date(2026, 6, 1))).toBe(3) // July — start of Q3
    expect(quarterOfDate(new Date(2026, 8, 30))).toBe(3) // September — end of Q3
    expect(quarterOfDate(new Date(2026, 9, 1))).toBe(4) // October — start of Q4
    expect(quarterOfDate(new Date(2026, 11, 31))).toBe(4) // December — end of Q4
  })
})

describe('quarterLabel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats every quarter with a Roman numeral and the year', () => {
    expect(quarterLabel(new Date(2026, 0, 1))).toBe('I квартал 2026')
    expect(quarterLabel(new Date(2026, 5, 8))).toBe('II квартал 2026')
    expect(quarterLabel(new Date(2025, 7, 1))).toBe('III квартал 2025')
    expect(quarterLabel(new Date(2025, 9, 10))).toBe('IV квартал 2025')
  })

  it('falls back to the current date when called without an argument', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 15)) // March → Q1
    expect(quarterLabel()).toBe('I квартал 2026')
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
