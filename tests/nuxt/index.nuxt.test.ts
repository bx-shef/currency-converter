import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import IndexPage from '~/pages/index.vue'
import { MOCK_RATES } from './fixtures'

// Spy the Metrika goal dispatcher so the "was it helpful?" nudge can be asserted
// without window.ym (mirrors the useB24 module-mock pattern used elsewhere).
const { reachGoalMock } = vi.hoisted(() => ({ reachGoalMock: vi.fn() }))
vi.mock('~/composables/useMetrikaGoal', () => ({
  useMetrikaGoal: () => ({ reachGoal: reachGoalMock })
}))

// Control whether the page believes it's inside a B24 frame (default: standalone).
const { b24State } = vi.hoisted(() => ({ b24State: { inFrame: false } }))
vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ isInit: () => b24State.inFrame }) }
})

// Read the raw JSON via cwd (not an `import` — @nuxtjs/i18n compiles JSON imports
// into message ASTs in the nuxt env; and import.meta.url isn't a file:// URL here,
// so readFileSync needs a plain fs path). Tests run from the repo root.
const ru = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/ru.json'), 'utf-8'))

// Intentionally broad smoke test: it asserts the page wires up (rows + date +
// "sum in words" render, error state shows) rather than exact content — adding a
// currency or relabelling a block may require touching the expectations below.
describe('index.vue (converter page)', () => {
  beforeEach(() => {
    localStorage.clear()
    reachGoalMock.mockClear()
    b24State.inFrame = false
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
    // #87 (other side of the decision): the RU-only standalone page DOES show the
    // RU currency name (from config), unlike the language-neutral B24 widget.
    expect(text).toContain('доллар США')
    // Header shows the parsed rates date and the "sum in words" block renders.
    expect(text).toContain('04.06.2026')
    expect(text).toContain('Сумма прописью')
    // The current-quarter label renders under the formula (date-agnostic check).
    expect(text).toContain('квартал')
  })

  it('leaves a rate-less currency row blank until its rate loads (#83)', async () => {
    // MOCK_RATES omits RSD (it is monthly-only), and the single $fetch mock feeds
    // it for both periodicities, so RSD never gets a rate → its input stays empty.
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    const rsdInput = wrapper.get('[aria-label="Сумма в RSD (сербский динар)"]')
    expect((rsdInput.element as HTMLInputElement).value).toBe('')
    // A loaded currency (KZT, scale 1000) does show a computed value.
    const kztInput = wrapper.get('[aria-label="Сумма в KZT (казахстанский тенге)"]')
    expect((kztInput.element as HTMLInputElement).value).not.toBe('')
  })

  it('shows the loading skeleton before the rates resolve', async () => {
    vi.stubGlobal('$fetch', vi.fn(() => new Promise(() => {}))) // never resolves → stays loading
    const wrapper = await mountSuspended(IndexPage)
    // No flushPromises: still in the loading state.
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Сумма прописью')
  })

  it('shows an error message when the rates fail to load', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // #97: index.vue renders the error as a RU literal (the page is RU-only),
    // which duplicates ru.json's app.fetchError. Assert against that key so the
    // two can't drift apart silently — if either changes, this fails.
    expect(wrapper.text()).toContain(ru.app.fetchError)
  })

  it('copies a row amount as a plain number (dot, no grouping)', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // BYN defaults to 100 → USD = 100 / 3.2 = 31.25; copied without grouping/comma.
    await wrapper.get('[aria-label="Скопировать сумму USD"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('31.25')
  })

  it('keeps rows and shows a dismissible refresh banner when a manual refresh fails (#156)', async () => {
    let calls = 0
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      calls++
      // Initial load (daily+monthly) succeeds; the refresh's daily feed fails.
      if (calls > 2 && !url.includes('periodicity=1')) throw new Error('down')
      return MOCK_RATES
    }))

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()
    expect(wrapper.text()).toContain('Сумма прописью') // rows loaded

    await wrapper.get('[aria-label="Обновить курсы"]').trigger('click')
    await flushPromises()

    // Rows are NOT blanked, and the soft banner (title + description) shows.
    expect(wrapper.text()).toContain('Сумма прописью')
    expect(wrapper.text()).toContain(ru.app.refreshError.title)
    expect(wrapper.text()).toContain(ru.app.refreshError.description)
    // Drift guard (mirrors #97): the in-template RU literals equal ru.json, so
    // the hardcoded page text and the locale string can't silently diverge.
    expect(ru.app.refreshError.title).toBe('Не удалось обновить курсы')
    expect(ru.app.refreshError.description).toBe('Показываем прежние курсы — попробуйте обновить ещё раз.')
    // fetchError's full-screen message must NOT be shown.
    expect(wrapper.text()).not.toContain(ru.app.fetchError)
  })

  it('shows the "резервная копия" badge when rates come from the fallback snapshot (#80)', async () => {
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.includes('rates-fallback.json')) {
        return { date: '2026-06-04T00:00:00', rates: [{ code: 'USD', bynRate: 3.5 }] }
      }
      throw new Error('nbrb down')
    }))

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // Rows render (from the snapshot) and the fallback badge is shown.
    expect(wrapper.text()).toContain('Сумма прописью')
    expect(wrapper.text()).toContain('резервная копия')
    // The full-screen error must NOT appear — we have snapshot data to show.
    expect(wrapper.text()).not.toContain(ru.app.fetchError)
  })

  it('copies the BYN sum-in-words via the extracted CopyButton (#82 @click fallthrough)', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    // The CopyButton wraps B24Button; the parent's @click must still fire and
    // copy the sum-in-words (guards the component-extraction refactor #82).
    await wrapper.get('[aria-label="Скопировать сумму прописью"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/рубл|копе/)) // ru words, not empty
  })

  it('shows the "helpful?" nudge and fires converter_helpful_yes on 👍', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Помог курс?')
    expect(reachGoalMock).not.toHaveBeenCalled() // nothing fires before interaction
    await wrapper.get('[aria-label="Да, курс помог"]').trigger('click')

    expect(reachGoalMock).toHaveBeenCalledWith('converter_helpful_yes')
    expect(localStorage.getItem('converter_helpful_v1')).toBe('1')
    await flushPromises()
    // Prompt is replaced by a thank-you and no longer asks.
    expect(wrapper.text()).toContain('Спасибо за отзыв')
    expect(wrapper.text()).not.toContain('Помог курс?')
  })

  it('fires converter_helpful_no on 👎 and records the answer', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    await wrapper.get('[aria-label="Нет, курс не помог"]').trigger('click')
    expect(reachGoalMock).toHaveBeenCalledWith('converter_helpful_no')
    expect(localStorage.getItem('converter_helpful_v1')).toBe('1')
    await flushPromises()
    expect(wrapper.text()).toContain('Спасибо за отзыв')
  })

  it('does not show the nudge once it was already answered', async () => {
    localStorage.setItem('converter_helpful_v1', '1')
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Помог курс?')
    expect(reachGoalMock).not.toHaveBeenCalled()
  })

  it('hides the nudge inside the B24 portal (telemetry is suppressed there)', async () => {
    b24State.inFrame = true
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Помог курс?')
  })
})
