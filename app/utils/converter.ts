/**
 * Currency conversion helpers.
 * Pure functions, no Vue/state dependencies — directly unit-testable.
 */

/**
 * Rounds a number to 4 decimal places, eliminating IEEE-754 noise.
 * Returns undefined for NaN/Infinity/non-finite values, so callers can
 * distinguish "no value" from a real zero.
 */
export function roundValue(num: number): number | undefined {
  if (!isFinite(num)) return undefined
  return Math.round(num * 10000) / 10000
}

/**
 * Converts `amount` units of a currency with rate `fromBynRate` (BYN per 1 unit)
 * into a currency with rate `toBynRate`. Returns undefined when either rate is
 * non-positive (rates not loaded yet) or the result is non-finite.
 */
export function convert(amount: number, fromBynRate: number, toBynRate: number): number | undefined {
  if (!(fromBynRate > 0) || !(toBynRate > 0)) return undefined
  if (!isFinite(amount)) return undefined
  return roundValue((amount * fromBynRate) / toBynRate)
}

/**
 * Adaptive step for the +/- buttons:
 *   < 200 → 10 (works for both fine-grained changes around the typical 100 BYN range)
 *   >= 200 → 100 (coarser jumps for larger sums)
 */
export function stepFor(value: number | undefined): number {
  if (typeof value !== 'number' || !isFinite(value)) return 10
  return Math.abs(value) >= 200 ? 100 : 10
}
