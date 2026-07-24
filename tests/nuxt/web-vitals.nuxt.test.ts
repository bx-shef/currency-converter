import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
// vi.mock calls below are hoisted above this import by vitest, so the plugin
// module already sees the mocked isEmbedded/useMetrikaGoal/web-vitals.
import webVitalsPlugin from '~/plugins/webVitals.client'

// Integration test for app/plugins/webVitals.client.ts — the pure webVitalGoal
// mapping is covered by tests/webVitals.test.ts; here we assert the plugin's
// wiring: the isEmbedded() standalone gate and the per-metric dedup Set, which
// the global web-vitals no-op stub (tests/nuxt/setup.ts) otherwise hides.
const { reachGoalMock, embedded, cbs } = vi.hoisted(() => ({
  reachGoalMock: vi.fn(),
  embedded: { value: false },
  // Capture the on* callbacks so the test can drive them (and drive them twice).
  cbs: { lcp: null as null | ((m: unknown) => void), cls: null as null | ((m: unknown) => void), inp: null as null | ((m: unknown) => void) }
}))

vi.mock('~/composables/useMetrikaGoal', () => ({
  useMetrikaGoal: () => ({ reachGoal: reachGoalMock })
}))
vi.mock('~/utils/isEmbedded', () => ({
  isEmbedded: () => embedded.value
}))
// Override the global no-op stub (setup.ts): store each callback instead.
vi.mock('web-vitals', () => ({
  onLCP: (cb: (m: unknown) => void) => { cbs.lcp = cb },
  onCLS: (cb: (m: unknown) => void) => { cbs.cls = cb },
  onINP: (cb: (m: unknown) => void) => { cbs.inp = cb }
}))

/** Run the plugin's setup regardless of functional/object plugin normalization. */
function runPlugin() {
  const p = webVitalsPlugin as unknown as { setup?: (app: unknown) => void } & ((app: unknown) => void)
  return (p.setup ?? p)({})
}

describe('webVitals.client plugin', () => {
  beforeEach(() => {
    reachGoalMock.mockClear()
    embedded.value = false
    cbs.lcp = cbs.cls = cbs.inp = null
  })

  it('does nothing inside an iframe (embedded): no lib load, no goal', async () => {
    embedded.value = true
    runPlugin()
    await flushPromises()

    // web-vitals is never imported → no callback was registered.
    expect(cbs.lcp).toBeNull()
    expect(reachGoalMock).not.toHaveBeenCalled()
  })

  it('standalone: reports each metric as a rating-bucket goal', async () => {
    runPlugin()
    await flushPromises() // resolve the dynamic import().then that registers callbacks

    expect(cbs.lcp).toBeTypeOf('function')
    cbs.lcp!({ name: 'LCP', rating: 'good' })
    cbs.cls!({ name: 'CLS', rating: 'needs-improvement' })
    cbs.inp!({ name: 'INP', rating: 'poor' })

    expect(reachGoalMock).toHaveBeenCalledWith('web_vitals_lcp_good')
    expect(reachGoalMock).toHaveBeenCalledWith('web_vitals_cls_ni')
    expect(reachGoalMock).toHaveBeenCalledWith('web_vitals_inp_poor')
    expect(reachGoalMock).toHaveBeenCalledTimes(3)
  })

  it('dedups: a second callback for the same metric fires no extra goal', async () => {
    runPlugin()
    await flushPromises()

    cbs.lcp!({ name: 'LCP', rating: 'good' })
    // web-vitals can flush the same metric again (e.g. on tab hide) with a
    // different rating — the dedup Set must keep it at one goal per visit.
    cbs.lcp!({ name: 'LCP', rating: 'poor' })

    expect(reachGoalMock).toHaveBeenCalledTimes(1)
    expect(reachGoalMock).toHaveBeenCalledWith('web_vitals_lcp_good')
  })
})
