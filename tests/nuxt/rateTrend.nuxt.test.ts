import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { historyCache } from '~/utils/rateHistory'

// Rate line and the 30-day chart of the chat widget (RateTrend.vue): nothing is fetched until the chart is opened;
// a late answer for a previous currency must not overwrite the current one; a failure does not stick.
const RateTrend = await import('~/components/RateTrend.vue').then(m => m.default)

const dyn = (rate: number) => [
  { Date: '2026-11-22T00:00:00', Cur_OfficialRate: rate },
  { Date: '2026-11-23T00:00:00', Cur_OfficialRate: rate + 0.01 },
  { Date: '2026-11-24T00:00:00', Cur_OfficialRate: rate + 0.02 }
]

describe('RateTrend', () => {
  beforeEach(() => {
    historyCache.clear()
    vi.unstubAllGlobals()
  })

  it('shows the rate per quoted units; nothing fetched until the chart is opened', async () => {
    const f = vi.fn()
    vi.stubGlobal('$fetch', f)
    const w = await mountSuspended(RateTrend, { props: { code: 'KZT', perUnit: 0.0059 } })
    expect(w.get('[data-testid="rate-line"]').text()).toMatch(/^1000 KZT = 5[.,]90 BYN$/)
    expect(f).not.toHaveBeenCalled()
  })

  it('opening fetches the rate ref and the dynamics, draws the line; reopening uses the cache', async () => {
    const f = vi.fn(async (url: string) => (url.includes('parammode=2') ? { Cur_ID: 431, Cur_Scale: 1 } : dyn(2.99)))
    vi.stubGlobal('$fetch', f)
    const w = await mountSuspended(RateTrend, { props: { code: 'USD', perUnit: 2.99 } })
    const btn = () => w.get('button')
    await btn().trigger('click')
    await flushPromises()
    expect(f).toHaveBeenCalledTimes(2)
    expect(w.get('[data-testid="rate-chart"] path').attributes('d')).toMatch(/^M/)
    expect(w.get('[data-testid="rate-chart"]').attributes('aria-label')).toContain('USD')
    await btn().trigger('click')
    await btn().trigger('click')
    await flushPromises()
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a late answer for the previous currency does not overwrite the current one', async () => {
    let releaseUsd!: () => void
    const usdGate = new Promise<void>(r => (releaseUsd = r))
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.includes('/USD?')) {
        await usdGate
        return { Cur_ID: 431, Cur_Scale: 1 }
      }
      if (url.includes('/EUR?')) return { Cur_ID: 451, Cur_Scale: 1 }
      return url.includes('/431?') ? dyn(2.99) : dyn(3.45)
    }))
    const w = await mountSuspended(RateTrend, { props: { code: 'USD', perUnit: 2.99 } })
    await w.get('button').trigger('click')
    await w.setProps({ code: 'EUR', perUnit: 3.45 })
    await flushPromises()
    releaseUsd()
    await flushPromises()
    expect(w.get('[data-testid="rate-chart"]').attributes('aria-label')).toContain('EUR')
  })

  it('a failure is shown, and a later success clears it', async () => {
    let fail = true
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (fail) throw new Error('down')
      return url.includes('parammode=2') ? { Cur_ID: 451, Cur_Scale: 1 } : dyn(3.45)
    }))
    const w = await mountSuspended(RateTrend, { props: { code: 'EUR', perUnit: 3.45 } })
    await w.get('button').trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/Не удалось|Could not/)
    fail = false
    await w.get('button').trigger('click')
    await w.get('button').trigger('click')
    await flushPromises()
    expect(w.text()).not.toMatch(/Не удалось|Could not/)
    expect(w.find('[data-testid="rate-chart"]').exists()).toBe(true)
  })
})
