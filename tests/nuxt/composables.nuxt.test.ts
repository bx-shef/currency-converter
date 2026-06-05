import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { useCopyFeedback, useKeyedCopyFeedback } from '~/composables/useCopyFeedback'

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

const MOCK_RATES = [
  { Cur_ID: 1, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар', Cur_OfficialRate: 3.2 },
  { Cur_ID: 2, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'EUR', Cur_Scale: 1, Cur_Name: 'Евро', Cur_OfficialRate: 3.5 },
  { Cur_ID: 3, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_Name: 'Рубль', Cur_OfficialRate: 3.6 }
]

const CACHE_KEY = 'nbrb_rates_v1'

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

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(api.currencies.value.find(c => c.code === 'USD')?.bynRate).toBe(3.2)
    expect(api.currencies.value.find(c => c.code === 'RUB')?.bynRate).toBeCloseTo(0.036)
    expect(api.loading.value).toBe(false)
    expect(api.ratesDate.value).not.toBe('')
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
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await api.refresh()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces an error message when the API fails', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const api = await runComposable(() => useNbrbRates())
    await flushPromises()

    expect(api.fetchError.value).not.toBe('')
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
  })

  it('useKeyedCopyFeedback marks the active key and colours only it', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })

    const api = await runComposable(() => useKeyedCopyFeedback())
    await api.copy('USD', '100')
    expect(api.activeKey.value).toBe('USD')
    expect(api.colorFor('USD', 'ok', 'err', 'idle')).toBe('ok')
    expect(api.colorFor('EUR', 'ok', 'err', 'idle')).toBe('idle')
  })
})
