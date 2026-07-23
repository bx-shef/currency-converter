// Web-vitals → Metrika goal mapping — pure core so it's unit-testable without a
// browser or the web-vitals lib. The client plugin (plugins/webVitals.client.ts)
// feeds it each metric's name + rating and forwards the goal to reachGoal.
//
// We report the *rating bucket* (good / needs-improvement / poor), never the raw
// numeric value — "shape/outcome, never content" (same privacy stance as the
// rate-health and helpful goals).

/** web-vitals' own rating for a sample. */
type WebVitalRating = 'good' | 'needs-improvement' | 'poor'

/** Short, stable suffix per rating for the goal name. */
const RATING_SUFFIX: Record<WebVitalRating, string> = {
  'good': 'good',
  'needs-improvement': 'ni',
  'poor': 'poor'
}

/** Core Web Vitals we report (others from web-vitals — FID/TTFB/FCP — are ignored). */
const TRACKED = new Set(['lcp', 'cls', 'inp'])

/**
 * Metrika goal name for a web-vital sample, e.g. `web_vitals_lcp_good`. Returns
 * `null` for an untracked metric or unknown rating so the caller can skip it
 * (defensive — a future web-vitals version could add a rating). Both `name` and
 * `rating` are normalised to lower-case before matching.
 */
export function webVitalGoal(name: string, rating: string): string | null {
  const metric = String(name).toLowerCase()
  if (!TRACKED.has(metric)) return null
  const suffix = RATING_SUFFIX[String(rating).toLowerCase() as WebVitalRating]
  if (!suffix) return null
  return `web_vitals_${metric}_${suffix}`
}
