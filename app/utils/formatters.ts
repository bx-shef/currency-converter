/**
 * Display formatting helpers for the converter.
 * Pure / framework-agnostic — directly unit-testable.
 *
 * NOTE on precision: amounts are stored with 4-decimal precision
 * (see `roundValue` in converter.ts) but displayed with exactly 2 fraction
 * digits. The extra internal precision keeps round-trip conversions accurate;
 * the UI only ever shows kopeck-level detail.
 */

/**
 * Intl options for the currency input fields. Plain grouped decimal — the
 * currency code is shown in the left column of every row, so embedding it in
 * the value (style: 'currency') only stole width and truncated the number.
 */
export const numberFormatOptions: Intl.NumberFormatOptions = {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true
}

const amountFormatter = new Intl.NumberFormat('ru-RU', numberFormatOptions)

/** Formats a number as a ru-RU grouped decimal with exactly 2 fraction digits. */
export function formatAmount(value: number): string {
  return amountFormatter.format(value)
}

/**
 * Formula factor for the page total: (X − 20%) × 20% ≡ X × 0.8 × 0.2 ≡ X × 0.16.
 * Spec'd by the page owner — see README › «Формула».
 */
export const FORMULA_FACTOR = 0.16

/** Applies the page formula to a BYN amount and rounds to 2 decimal places. */
export function applyFormula(byn: number): number {
  return Math.round(byn * FORMULA_FACTOR * 100) / 100
}

/** Roman numerals for quarters 1–4 (index = quarter − 1). */
const ROMAN_QUARTERS = ['I', 'II', 'III', 'IV'] as const

/** Calendar quarter (1–4) for a date — months 0–2 → 1, 3–5 → 2, etc. */
export function quarterOfDate(date: Date = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
}

/**
 * Human-readable current-quarter label for the formula block,
 * e.g. "II квартал 2026". Defaults to the current date.
 */
export function quarterLabel(date: Date = new Date()): string {
  // quarterOfDate is always 1–4, so the index is always in range.
  return `${ROMAN_QUARTERS[quarterOfDate(date) - 1]!} квартал ${date.getFullYear()}`
}

/** Upper-cases the first character only; returns '' for empty input. */
export function capitalizeFirst(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : ''
}

/**
 * Plain numeric string for the clipboard: exactly 2 fraction digits, dot
 * separator, no grouping — pastes cleanly into spreadsheets / payment forms
 * (e.g. 1234.5 → "1234.50"). Non-finite input yields "0.00".
 */
export function formatPlainAmount(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}
