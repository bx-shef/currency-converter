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

  it('shows the "helpful?" nudge and fires converter_helpful_yes on 👍', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).toContain('Помог курс?')
    await wrapper.get('[aria-label="Да, курс помог"]').trigger('click')

    expect(reachGoalMock).toHaveBeenCalledWith('converter_helpful_yes')
    expect(localStorage.getItem('converter_helpful_v1')).toBe('1')
    await flushPromises()
    // Prompt is replaced by a thank-you and no longer asks.
    expect(wrapper.text()).toContain('Спасибо за отзыв')
    expect(wrapper.text()).not.toContain('Помог курс?')
  })

  it('fires converter_helpful_no on 👎', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    await wrapper.get('[aria-label="Нет, курс не помог"]').trigger('click')
    expect(reachGoalMock).toHaveBeenCalledWith('converter_helpful_no')
  })

  it('does not show the nudge once it was already answered', async () => {
    localStorage.setItem('converter_helpful_v1', '1')
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Помог курс?')
    expect(reachGoalMock).not.toHaveBeenCalled()
  })
})
