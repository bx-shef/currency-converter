import { describe, expect, it } from 'vitest'
import { webVitalGoal } from '../app/utils/webVitals'

describe('webVitalGoal', () => {
  it('maps each metric + rating to a stable Metrika goal name', () => {
    expect(webVitalGoal('LCP', 'good')).toBe('web_vitals_lcp_good')
    expect(webVitalGoal('LCP', 'needs-improvement')).toBe('web_vitals_lcp_ni')
    expect(webVitalGoal('LCP', 'poor')).toBe('web_vitals_lcp_poor')
    expect(webVitalGoal('CLS', 'good')).toBe('web_vitals_cls_good')
    expect(webVitalGoal('INP', 'poor')).toBe('web_vitals_inp_poor')
  })

  it('lower-cases the metric name (web-vitals reports upper-case)', () => {
    expect(webVitalGoal('inp', 'good')).toBe('web_vitals_inp_good')
  })

  it('returns null for an unknown rating (a future rating must not send a broken goal)', () => {
    expect(webVitalGoal('LCP', 'excellent')).toBeNull()
    expect(webVitalGoal('LCP', '')).toBeNull()
  })

  it('returns null for a metric we do not track (e.g. FID/TTFB/FCP)', () => {
    expect(webVitalGoal('FID', 'good')).toBeNull()
    expect(webVitalGoal('TTFB', 'good')).toBeNull()
  })
})
