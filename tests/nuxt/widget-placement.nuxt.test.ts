import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { MOCK_RATES } from './fixtures'

// Drive the placement the widget thinks it was opened in. `vi.hoisted` lets the
// (hoisted) vi.mock factory read a value we can flip per test.
const state = vi.hoisted(() => ({ placement: 'IM_TEXTAREA' }))

vi.mock('~/composables/useB24', () => ({
  useB24: () => ({
    init: vi.fn(async () => {}),
    isInit: () => true,
    get: () => ({}),
    getOrThrow: () => ({
      placement: { placement: state.placement },
      parent: { message: { send: vi.fn(async () => {}) } }
    }),
    targetOrigin: () => 'https://example.bitrix24.by',
    getRequiredRights: () => []
  })
}))

const WidgetConverter = await import('~/pages/widget/converter.vue').then(m => m.default)

// Regression guard for the #89 fix: the mobile context-menu slider has no chat
// input, so im:setImTextareaContent can't reach a textarea — the widget must
// offer "Copy" there instead of "Insert into chat".
describe('widget/converter.vue — placement drives the primary action (#89)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('IM_TEXTAREA → primary button inserts into chat', async () => {
    state.placement = 'IM_TEXTAREA'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()
    expect(wrapper.text()).toContain('Insert into chat')
  })

  it('IMMOBILE_CONTEXT_MENU → primary button copies instead', async () => {
    state.placement = 'IMMOBILE_CONTEXT_MENU'
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Copy')
    expect(text).not.toContain('Insert into chat')
  })
})
