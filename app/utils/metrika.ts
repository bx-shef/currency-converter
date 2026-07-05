// Yandex.Metrika goal dispatch — pure core so it can be unit-tested without a
// Nuxt runtime. The composable (useMetrikaGoal) injects `window.ym` and the
// counter id from runtimeConfig.

/**
 * Fire a Metrika goal via the injected `ym` global. Returns whether it fired.
 * No-op (false) when tracking is off — a blank/invalid counter id — or when
 * `ym` isn't a function (Metrika not loaded, e.g. suppressed inside the B24
 * portal iframe by metrika.js).
 */
export function reachMetrikaGoal(
  ym: unknown,
  counterId: string | number | undefined | null,
  goal: string
): boolean {
  const id = Number(counterId)
  if (!Number.isFinite(id) || id <= 0) return false
  if (typeof ym !== 'function') return false
  ;(ym as (...args: unknown[]) => void)(id, 'reachGoal', goal)
  return true
}
