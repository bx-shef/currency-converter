import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { MOCK_RATES } from './fixtures'

// Capture the chat-insert call on a stable spy. `vi.hoisted` lets the hoisted
// vi.mock factory read it.
const state = vi.hoisted(() => ({ send: vi.fn(async () => {}) }))

// Typed shared fake (tests/nuxt/helpers/mockB24) so the mock can't drift from the
// real useB24 surface. The async factory lets us import the helper past hoisting.
vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ send: state.send }) }
})

const WidgetConverter = await import('~/pages/widget/converter.vue').then(m => m.default)

function buttonByText(wrapper: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }, label: string) {
  return wrapper.findAll('button').find(b => b.text().includes(label))
}

// The widget binds to a single placement (IM_TEXTAREA). Its primary action
// inserts the sum-in-words into the chat input via the documented messenger
// method `im:setImTextareaContent`; clipboard copy buttons are an extra affordance.
describe('widget/converter.vue — insert into chat', () => {
  beforeEach(() => {
    localStorage.clear()
    state.send.mockClear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('"Insert into chat" sends im:setImTextareaContent with the sum-in-words text', async () => {
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    const btn = buttonByText(wrapper, 'Insert into chat')
    expect(btn, 'insert button should be rendered').toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      'im:setImTextareaContent',
      expect.objectContaining({ text: expect.any(String), replace: true })
    )
  })

  it('renders the clipboard copy buttons (copy amount / copy words)', async () => {
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    const copyButtons = wrapper.findAll('button').filter(b => (b.attributes('aria-label') || '').toLowerCase().includes('copy'))
    expect(copyButtons.length, 'copy affordances are present').toBeGreaterThan(0)
  })
})
