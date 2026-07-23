import { webVitalGoal } from '~/utils/webVitals'
import { isEmbedded } from '~/utils/isEmbedded'
import { useMetrikaGoal } from '~/composables/useMetrikaGoal'

// Reports Core Web Vitals (LCP / CLS / INP) to Metrika as rating-bucket goals.
// Standalone only: inside the Bitrix24 portal iframe Metrika is suppressed
// (public/metrika.js self-disables in a frame), so a goal would no-op there —
// and we skip loading the web-vitals lib entirely. The lib is a dynamic import
// so it never sits on the initial critical path.
export default defineNuxtPlugin(() => {
  if (isEmbedded()) return

  const { reachGoal } = useMetrikaGoal()
  // web-vitals' on* callbacks can fire more than once per visit (e.g. a final
  // flush on tab hide); report each metric at most once so goal counts stay
  // «one bucket per metric per visit».
  const reported = new Set<string>()
  const report = (name: string, rating: string) => {
    const goal = webVitalGoal(name, rating)
    if (!goal || reported.has(name)) return
    reported.add(name)
    reachGoal(goal)
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
