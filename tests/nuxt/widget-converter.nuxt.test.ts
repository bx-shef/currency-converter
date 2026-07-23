import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import WidgetConverter from '~/pages/widget/converter.vue'
import { DEFAULT_CURRENCIES } from '~/config/currencies'
import { MOCK_RATES } from './fixtures'

// Read raw JSON via cwd — @nuxtjs/i18n compiles JSON imports into message ASTs.
const en = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/en.json'), 'utf-8'))

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
    // currency names (those render only on the RU-only index.vue). If any name
    // leaks into the widget, it must be localized first.
    for (const c of DEFAULT_CURRENCIES) {
      expect(text, `widget must not render the RU name "${c.name}"`).not.toContain(c.name)
    }
  })

  it('the widget page and its clear layout use w-full, never w-screen (#135)', () => {
    // happy-dom has no layout engine and mountSuspended doesn't render the
    // NuxtLayout, so the real culprit (the `clear` wrapper) never appears in the
    // mounted tree — guard on source instead. w-screen (=100vw) includes the
    // reserved scrollbar gutter (b24ui sets `scrollbar-gutter: stable` on body),
    // so it forced a few-px horizontal scrollbar in the narrow chat popup.
    // Match w-screen only where it's used as a class, not the word in the
    // explanatory comments that reference it.
    const asClass = /class="[^"]*\bw-screen\b/
    for (const f of ['app/pages/widget/converter.vue', 'app/layouts/clear.vue']) {
      const src = readFileSync(join(process.cwd(), f), 'utf-8')
      expect(asClass.test(src), `${f} must not use w-screen (100vw) — see #135`).toBe(false)
    }
  })

  it('shows the localized fetch error (not the raw error code) when rates fail', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    // useNbrbRates sets fetchError='load' (a code); the widget renders it via
    // t('app.fetchError'). Test locale resolves to English — assert against
    // en.json's value (not a hardcoded string) so the two can't drift (#97).
    expect(wrapper.text()).toContain(en.app.fetchError)
    // UX contract: the primary action is disabled on error (don't push an empty
    // message to the chat). The refresh button is `:disabled="loading"` → enabled
    // after the failed load, so the only disabled button is the primary one.
    expect(wrapper.find('button[disabled]').exists()).toBe(true)
  })
})
