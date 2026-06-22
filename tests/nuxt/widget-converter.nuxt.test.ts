import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import WidgetConverter from '~/pages/widget/converter.vue'
import { MOCK_RATES } from './fixtures'

// The widget runs outside a B24 frame here (no window.name), so useB24().init()
// is a no-op and the placement stays default — we only exercise the rate/error UI.
describe('widget/converter.vue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the currency rows once rates load', async () => {
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    const text = wrapper.text()
    for (const code of ['USD', 'EUR', 'BYN']) {
      expect(text).toContain(code)
    }
    // #87: the B24 widget is language-neutral — it shows codes, never the RU
    // currency names (those render only on the RU-only index.vue). If a name
    // ever leaks into the widget, it must be localized first.
    expect(text).not.toContain('доллар США')
    expect(text).not.toContain('российский рубль')
  })

  it('shows the localized fetch error (not the raw error code) when rates fail', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    // useNbrbRates sets fetchError='load' (a code); the widget renders it via
    // t('app.fetchError'). Test locale resolves to the English message — the full
    // sentence proves localization happened rather than the raw 'load' code.
    expect(wrapper.text()).toContain('Failed to load NBRB rates. Please refresh the page.')
    // UX contract: the primary action is disabled on error (don't push an empty
    // message to the chat). The refresh button is `:disabled="loading"` → enabled
    // after the failed load, so the only disabled button is the primary one.
    expect(wrapper.find('button[disabled]').exists()).toBe(true)
  })
})
