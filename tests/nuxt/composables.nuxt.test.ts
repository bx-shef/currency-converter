import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { useCopyFeedback, useKeyedCopyFeedback } from '~/composables/useCopyFeedback'
import { MAX_AMOUNT } from '~/config/currencies'
import { CACHE_KEY, MOCK_MONTHLY_RATES, MOCK_RATES } from './fixtures'

// `$fetch` is mocked via vi.stubGlobal: in the Nuxt test env it resolves off the
// global, so stubbing globalThis.$fetch intercepts the composable's calls.

/** Runs a composable inside a mounted component and returns its result. */
async function runComposable<T>(fn: () => T): Promise<T> {
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = fn()
      return () => null
    }
  })
  await mountSuspended(Comp)
  return result
}

describe('useNbrbRates', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads rates from the API on mount and fills bynRate', async () => {
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2) // daily + monthly feed
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
    expect(api.currencies.value.find(c => c.code === 'RUB')?.bynRate).toBeCloseTo(0.036, 10)
    expect(api.loading.value).toBe(false)
    expect(api.ratesDate.value).not.toBe('')
  })

  it('merges the monthly feed so RSD (daily-feed-omitted) gets a rate', async () => {
    // Daily feed lacks RSD; the monthly feed carries it. The composable fetches
    // both in parallel and merges, so the RSD row must end up with a rate.
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('periodicity=1') ? MOCK_MONTHLY_RATES : MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    // 2.8198 per 100 dinars → 0.028198 BYN per dinar.
    expect(api.currencies.value.find(c => c.code === 'RSD')?.bynRate).toBeCloseTo(0.028198, 10)
    // Daily currencies still load normally.
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
  })

  it('degrades gracefully when only the monthly feed fails', async () => {
    // Monthly feed down, daily up: no error, daily rows work, RSD stays blank.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('periodicity=1')) throw new Error('monthly down')
      return MOCK_RATES
    })
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).toBe('')
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
    expect(api.currencies.value.find(c => c.code === 'RSD')?.value).toBeUndefined()
  })

  it('uses a fresh cache without hitting the API', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      date: '04.06.2026',
      rates: [{ code: 'USD', bynRate: 9.99 }],
      timestamp: Date.now()
    }))
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(9.99)
    expect(api.ratesDate.value).toBe('04.06.2026')
    expect(api.loading.value).toBe(false)
  })

  it('refresh refetches the rates', async () => {
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2) // daily + monthly

    await api.refresh()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(4) // 2 loads × (daily + monthly)
  })

  it('ignores a re-entrant refresh while one is already in flight', async () => {
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2) // initial mount load (daily + monthly)

    const first = api.refresh() // sets refreshing=true, fetch in flight
    const second = api.refresh() // guard: refreshing → ignored, no fetch
    await Promise.all([first, second])
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(4) // only the first refresh fetched (daily + monthly)
  })

  it('refetches when the cached rates are stale (past the 12h TTL)', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      date: '01.01.2020',
      rates: [{ code: 'USD', bynRate: 1 }],
      timestamp: Date.now() - 13 * 60 * 60 * 1000 // 13h old > 12h TTL
    }))
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2) // daily + monthly
    // Fresh rate from the API, not the stale cached 1.
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
  })

  it('surfaces an error message when the API fails', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
    expect(api.loading.value).toBe(false)
  })

  it('recomputes other currencies when a value is entered', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    // 100 USD → BYN at rate 3.2 = 320 BYN.
    api.onValueUpdate('USD', 100)
    expect(api.currencies.value.find(c => c.code === 'BYN')?.value).toBe(320)
    expect(api.activeCurrency.value).toBe('USD')
  })

  it('onRowClick sets the active currency', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    api.onRowClick('EUR')
    expect(api.activeCurrency.value).toBe('EUR')
  })

  it('incrementCurrency clamps at MAX_AMOUNT', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    api.onValueUpdate('BYN', MAX_AMOUNT)
    api.incrementCurrency('BYN')
    expect(api.currencies.value.find(c => c.code === 'BYN')?.value).toBe(MAX_AMOUNT)
  })

  it('decrementCurrency clamps at 0', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    api.onValueUpdate('BYN', 1) // step is 1 below 10
    api.decrementCurrency('BYN')
    expect(api.currencies.value.find(c => c.code === 'BYN')?.value).toBe(0)
    api.decrementCurrency('BYN') // stays clamped at 0
    expect(api.currencies.value.find(c => c.code === 'BYN')?.value).toBe(0)
  })

  it('surfaces an error when the API returns no usable rates', async () => {
    // parseNbrbRates drops this record (non-positive scale/rate) → empty map.
    vi.stubGlobal('$fetch', vi.fn(async () => [{ Cur_Scale: 0, Cur_OfficialRate: 0 }]))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
  })

  it('leaves the date label empty when the API Date is invalid', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => [
      { Cur_ID: 1, Date: 'not-a-date', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар', Cur_OfficialRate: 3.2 }
    ]))
    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
    expect(api.ratesDate.value).toBe('')
  })

  it('falls back to the API when localStorage access throws (SecurityError)', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const fetchMock = vi.fn(async () => MOCK_RATES)
    vi.stubGlobal('$fetch', fetchMock)

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2) // daily + monthly
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
    getItem.mockRestore()
  })

  it('fires only rates_load_failed when the whole API is down (both feeds fail)', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    const onGoal = vi.fn()

    const api = await runComposable(() => useNbrbRates({ onGoal }))
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
    // A total outage is one signal, not two: the monthly gap must NOT also fire,
    // otherwise it blurs the partial-degradation signal.
    expect(onGoal).toHaveBeenCalledWith('rates_load_failed')
    expect(onGoal).not.toHaveBeenCalledWith('rates_monthly_missing')
    expect(onGoal).toHaveBeenCalledTimes(1)
  })

  it('fires only rates_monthly_missing when just the monthly feed fails', async () => {
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.includes('periodicity=1')) throw new Error('monthly down')
      return MOCK_RATES
    }))
    const onGoal = vi.fn()

    const api = await runComposable(() => useNbrbRates({ onGoal }))
    await flushPromises()

    // Daily still loads (no load-failure), only the partial degradation is reported.
    expect(api.fetchError.value).toBe('')
    expect(onGoal).toHaveBeenCalledWith('rates_monthly_missing')
    expect(onGoal).not.toHaveBeenCalledWith('rates_load_failed')
    expect(onGoal).toHaveBeenCalledTimes(1)
  })

  it('fires rates_load_failed (not monthly_missing) when the API returns no usable rates', async () => {
    // Both feeds 200 but every record is dropped by parseNbrbRates → empty map →
    // throw. Monthly resolved (didn't reject), so it is not a "monthly missing".
    vi.stubGlobal('$fetch', vi.fn(async () => [{ Cur_Scale: 0, Cur_OfficialRate: 0 }]))
    const onGoal = vi.fn()

    const api = await runComposable(() => useNbrbRates({ onGoal }))
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
    expect(onGoal).toHaveBeenCalledWith('rates_load_failed')
    expect(onGoal).not.toHaveBeenCalledWith('rates_monthly_missing')
  })

  it('fires no health goal on a fully successful load', async () => {
    vi.stubGlobal('$fetch', vi.fn(async (url: string) =>
      url.includes('periodicity=1') ? MOCK_MONTHLY_RATES : MOCK_RATES))
    const onGoal = vi.fn()

    const api = await runComposable(() => useNbrbRates({ onGoal }))
    await flushPromises()

    expect(api.fetchError.value).toBe('')
    expect(onGoal).not.toHaveBeenCalled()
  })

  it('reports rates_load_failed again when a refresh fails after a healthy load', async () => {
    let calls = 0
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      calls++
      // Initial load (2 calls: daily+monthly) succeeds; the refresh's daily fails.
      if (calls > 2 && !url.includes('periodicity=1')) throw new Error('down')
      return MOCK_RATES
    }))
    const onGoal = vi.fn()

    const api = await runComposable(() => useNbrbRates({ onGoal }))
    await flushPromises()
    expect(onGoal).not.toHaveBeenCalled() // healthy initial load fires nothing

    await api.refresh()
    await flushPromises()
    expect(onGoal).toHaveBeenCalledWith('rates_load_failed')
  })

  it('keeps rows and raises refreshError (not fetchError) when a refresh fails after a healthy load (#156)', async () => {
    let calls = 0
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      calls++
      if (calls > 2 && !url.includes('periodicity=1')) throw new Error('down')
      return MOCK_RATES
    }))

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)

    await api.refresh()
    await flushPromises()

    // Soft error: existing rates stay, fetchError is NOT set (UI not blanked).
    expect(api.refreshError.value).toBe(true)
    expect(api.fetchError.value).toBe('')
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)

    // Dismiss clears the banner; a subsequent successful refresh also clears it.
    api.dismissRefreshError()
    expect(api.refreshError.value).toBe(false)
  })

  it('a failed FIRST load sets fetchError, not refreshError (nothing to show)', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
    expect(api.refreshError.value).toBe(false)
  })

  it('does not throw when the default (uninjected) goal reporter is used', async () => {
    // No onGoal passed → defaults to useMetrikaGoal().reachGoal, which is
    // no-op-safe here (no window.ym / blank counter). Load must still fail cleanly.
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).toBe('load')
    expect(api.loading.value).toBe(false)
  })
})

describe('useCopyFeedback wrappers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('useCopyFeedback flashes ok after a successful copy', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const api = await runComposable(() => useCopyFeedback())
    expect(api.state.value).toBe('idle')
    await api.copy('1234.50')
    expect(writeText).toHaveBeenCalledWith('1234.50')
    expect(api.state.value).toBe('ok')
    api.dispose() // clear the pending flash timer (component stays mounted in the test)
  })

  it('useKeyedCopyFeedback marks the active key and colours only it', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })

    const api = await runComposable(() => useKeyedCopyFeedback())
    await api.copy('USD', '100')
    expect(api.activeKey.value).toBe('USD')
    expect(api.colorFor('USD', 'ok', 'err', 'idle')).toBe('ok')
    expect(api.colorFor('EUR', 'ok', 'err', 'idle')).toBe('idle')
    api.dispose()
  })
})
