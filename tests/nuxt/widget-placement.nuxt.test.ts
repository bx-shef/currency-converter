import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { MOCK_RATES } from './fixtures'

// Drive the placement the widget thinks it was opened in, and capture the chat
// insert call on a stable spy. `vi.hoisted` lets the hoisted vi.mock factory read it.
const state = vi.hoisted(() => ({
  placement: 'IM_TEXTAREA',
  send: vi.fn(async () => {})
}))

// Typed shared fake (tests/nuxt/helpers/mockB24) so the mock can't drift from the
// real useB24 surface. The async factory lets us import the helper past hoisting.
vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ placement: () => state.placement, send: state.send }) }
})

const WidgetConverter = await import('~/pages/widget/converter.vue').then(m => m.default)

function buttonByText(wrapper: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }, label: string) {
  return wrapper.findAll('button').find(b => b.text().includes(label))
}

function copyButtonCount(wrapper: { findAll: (s: string) => Array<{ attributes: (k: string) => string | undefined }> }) {
  return wrapper.findAll('button').filter(b => (b.attributes('aria-label') || '').toLowerCase().includes('copy')).length
}

// #89, revised after mobile testing: the mobile context-menu WebView has no
// Clipboard API (copy silently fails there), so the widget no longer offers
// "Copy". The primary action is "Insert into chat" (→ im:setImTextareaContent)
// for BOTH placements; the per-row / per-words clipboard buttons are shown only
// in the desktop IM_TEXTAREA panel.
describe('widget/converter.vue — placement drives clipboard affordances (#89)', () => {
  beforeEach(() => {
    localStorage.clear()
    state.placement = 'IM_TEXTAREA' // reset default — don't rely on test order
    state.send.mockClear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('IM_TEXTAREA → "Insert into chat" sends im:setImTextareaContent; copy buttons shown', async () => {
    state.placement = 'IM_TEXTAREA'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    // Desktop shows clipboard affordances (copy amount / copy words).
    expect(copyButtonCount(wrapper), 'desktop shows copy buttons').toBeGreaterThan(0)

    const btn = buttonByText(wrapper, 'Insert into chat')
    expect(btn, 'insert button should be rendered').toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      'im:setImTextareaContent',
      expect.objectContaining({ text: expect.any(String) })
    )
  })

  it('IMMOBILE_CONTEXT_MENU → still "Insert into chat" (no clipboard); copy buttons hidden', async () => {
    state.placement = 'IMMOBILE_CONTEXT_MENU'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    // Mobile WebView: no clipboard API, so no copy buttons at all.
    expect(copyButtonCount(wrapper), 'mobile hides copy buttons').toBe(0)
    expect(wrapper.text()).not.toContain('Copy')

    // The primary action still inserts the sum-in-words into the chat.
    const btn = buttonByText(wrapper, 'Insert into chat')
    expect(btn, 'insert button present on mobile too').toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      'im:setImTextareaContent',
      expect.objectContaining({ text: expect.any(String) })
    )
  })
})
