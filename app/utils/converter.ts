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

/** Values below this threshold use step 1 for +/− buttons. */
const STEP_THRESHOLD_FINE = 10
/** Values at or above this threshold use step 100 for +/− buttons. */
const STEP_THRESHOLD_COARSE = 200

/**
 * Adaptive step for the +/- buttons based on the current value.
 *
 * @param value current input value; `undefined` / non-finite → step 1.
 * @returns 100 when `|value| >= 200`, 10 when `|value| >= 10`, else 1.
 */
export function stepFor(value: number | undefined): number {
  if (typeof value !== 'number' || !isFinite(value)) return 1
  const abs = Math.abs(value)
  if (abs >= STEP_THRESHOLD_COARSE) return 100
  if (abs >= STEP_THRESHOLD_FINE) return 10
  return 1
}

/**
 * Applies one adaptive step to `value` in the given direction.
 * Treats `undefined` / non-finite input as 0.
 * Does NOT clamp to [min, max] — clamping is the caller's responsibility.
 *
 * @param value current amount; `undefined` / non-finite treated as 0.
 * @param direction +1 to increment, -1 to decrement.
 */
export function applyStep(value: number | undefined, direction: 1 | -1): number {
  const current = typeof value === 'number' && isFinite(value) ? value : 0
  return roundValue(current + direction * stepFor(current)) ?? current
}
