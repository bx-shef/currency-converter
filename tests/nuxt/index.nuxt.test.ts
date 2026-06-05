import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import IndexPage from '~/pages/index.vue'

const MOCK_RATES = [
  { Cur_ID: 1, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар', Cur_OfficialRate: 3.2 },
  { Cur_ID: 2, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'EUR', Cur_Scale: 1, Cur_Name: 'Евро', Cur_OfficialRate: 3.5 },
  { Cur_ID: 3, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_Name: 'Рубль', Cur_OfficialRate: 3.6 }
]

describe('index.vue (converter page)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the currency rows and rates date once rates load', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    const text = wrapper.text()
    // Currency codes from DEFAULT_CURRENCIES are visible (skeleton replaced).
    for (const code of ['RUB', 'BYN', 'KZT', 'USD', 'EUR']) {
      expect(text).toContain(code)
    }
    // Header shows the parsed rates date and the "sum in words" block renders.
    expect(text).toContain('04.06.2026')
    expect(text).toContain('Сумма прописью')
  })

  it('shows an error message when the rates fail to load', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Не удалось загрузить курсы')
  })
})
