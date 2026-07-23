import { vi } from 'vitest'

// The webVitals.client plugin dynamically imports web-vitals when it thinks it's
// standalone. In the Nuxt test runtime (happy-dom, self === top) that plugin runs
// on every mountSuspended, so stub the lib to no-op callbacks — otherwise each
// mounted test would register real PerformanceObservers that outlive it.
vi.mock('web-vitals', () => ({
  onLCP: () => {},
  onCLS: () => {},
  onINP: () => {}
}))
