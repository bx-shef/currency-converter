import { webVitalGoal } from '~/utils/webVitals'
import { useMetrikaGoal } from '~/composables/useMetrikaGoal'

// Reports Core Web Vitals (LCP / CLS / INP) to Metrika as rating-bucket goals.
// Standalone only: inside the Bitrix24 portal iframe Metrika is suppressed
// (public/metrika.js self-disables in a frame), so a goal would no-op there —
// and we skip loading the web-vitals lib entirely. The lib is a dynamic import
// so it never sits on the initial critical path.
export default defineNuxtPlugin(() => {
  let embedded = false
  try {
    embedded = window.self !== window.top
  } catch {
    embedded = true // cross-origin access threw → we're framed
  }
  if (embedded) return

  const { reachGoal } = useMetrikaGoal()
  const report = (name: string, rating: string) => {
    const goal = webVitalGoal(name, rating)
    if (goal) reachGoal(goal)
  }

  import('web-vitals')
    .then(({ onLCP, onCLS, onINP }) => {
      onLCP(m => report(m.name, m.rating))
      onCLS(m => report(m.name, m.rating))
      onINP(m => report(m.name, m.rating))
    })
    .catch(() => {
      // web-vitals failed to load — telemetry is best-effort, never fatal.
    })
})
