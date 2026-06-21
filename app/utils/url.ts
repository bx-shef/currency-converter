/**
 * URL safety helpers. Pure — directly unit-testable.
 */

/**
 * Returns `raw` only when it is an http(s) URL, otherwise `fallback`. Guards a
 * rendered `:href` against `javascript:` / `data:` values when an
 * operator-controlled env var (author / site URL) is misconfigured or tampered.
 *
 * @param raw candidate URL (e.g. from `runtimeConfig.public`).
 * @param fallback value returned when `raw` is empty or not http(s).
 */
export function safeHttpUrl(raw: string, fallback: string): string {
  if (!raw) return fallback
  return /^https?:\/\//i.test(raw) ? raw : fallback
}
