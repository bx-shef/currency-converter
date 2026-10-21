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

// Nuxt 4.6+ auto-imports `$fetch` from `#build/fetch` instead of reading the
// global, so tests that `vi.stubGlobal('$fetch', …)` would no longer intercept
// the composables' calls. Delegate the import to the global at call time — each
// test keeps stubbing `globalThis.$fetch` as before.
vi.mock('#build/fetch', () => ({
  $fetch: (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args)
}))
