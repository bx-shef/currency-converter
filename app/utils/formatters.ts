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
