import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { MOCK_RATES } from './fixtures'

// Drive the placement the widget thinks it was opened in, and capture the two
// side-effecting calls (chat insert / clipboard) on stable spies so we can assert
// them. `vi.hoisted` lets the (hoisted) vi.mock factories read these.
const state = vi.hoisted(() => ({
  placement: 'IM_TEXTAREA',
  send: vi.fn(async () => {}),
  writeClip: vi.fn(async () => true)
}))

// Typed shared fake (tests/nuxt/helpers/mockB24) so the mock can't drift from the
// real useB24 surface. The async factory lets us import the helper past hoisting.
vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ placement: () => state.placement, send: state.send }) }
})

vi.mock('~/utils/copyFeedback', () => ({
  writeToClipboard: state.writeClip
}))

const WidgetConverter = await import('~/pages/widget/converter.vue').then(m => m.default)

/** Finds the bottom primary action button (the top one is the icon-only refresh). */
function primaryButton(wrapper: { findAll: (s: string) => Array<{ text: () => string, trigger: (e: string) => Promise<void> }> }, label: string) {
  return wrapper.findAll('button').find(b => b.text().includes(label))
}

// Regression guard for the #89 fix: the mobile context-menu slider has no chat
// input, so the widget must offer "Copy" there (→ clipboard) instead of
// "Insert into chat" (→ im:setImTextareaContent in the chat frame).
describe('widget/converter.vue — placement drives the primary action (#89)', () => {
  beforeEach(() => {
    localStorage.clear()
    state.placement = 'IM_TEXTAREA' // reset default — don't rely on test order
    state.send.mockClear()
    state.writeClip.mockClear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('IM_TEXTAREA → button "Insert into chat" sends im:setImTextareaContent', async () => {
    state.placement = 'IM_TEXTAREA'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Copy') // symmetry: no mobile copy label here
    const btn = primaryButton(wrapper, 'Insert into chat')
    expect(btn, 'insert button should be rendered').toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(state.send).toHaveBeenCalledWith(
      'im:setImTextareaContent',
      expect.objectContaining({ text: expect.any(String) })
    )
    expect(state.writeClip).not.toHaveBeenCalled()
  })

  it('IMMOBILE_CONTEXT_MENU → button "Copy" writes to the clipboard, no chat send', async () => {
    state.placement = 'IMMOBILE_CONTEXT_MENU'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Copy')
    expect(text).not.toContain('Insert into chat')

    const btn = primaryButton(wrapper, 'Copy')
    await btn!.trigger('click')
    await flushPromises()

    expect(state.writeClip).toHaveBeenCalledWith(expect.any(String))
    expect(state.send).not.toHaveBeenCalled()
  })
})
