// Web-vitals → Metrika goal mapping — pure core so it's unit-testable without a
// browser or the web-vitals lib. The client plugin (plugins/webVitals.client.ts)
// feeds it each metric's name + rating and forwards the goal to reachGoal.
//
// We report the *rating bucket* (good / needs-improvement / poor), never the raw
// numeric value — "shape/outcome, never content" (same privacy stance as the
// rate-health and helpful goals).

/** Core Web Vitals we track. */
export type WebVitalName = 'LCP' | 'CLS' | 'INP'
/** web-vitals' own rating for a sample. */
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor'

/** Short, stable suffix per rating for the goal name. */
const RATING_SUFFIX: Record<WebVitalRating, string> = {
  'good': 'good',
  'needs-improvement': 'ni',
  'poor': 'poor'
}

/**
 * Metrika goal name for a web-vital sample, e.g. `web_vitals_lcp_good`. Returns
 * `null` for an unknown name/rating so the caller can skip it (defensive — a
 * future web-vitals version could add a rating).
 */
export function webVitalGoal(name: string, rating: string): string | null {
  const suffix = RATING_SUFFIX[rating as WebVitalRating]
  if (!suffix) return null
  const metric = String(name).toLowerCase()
  if (metric !== 'lcp' && metric !== 'cls' && metric !== 'inp') return null
  return `web_vitals_${metric}_${suffix}`
}
