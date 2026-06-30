import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { useState } from '#imports'
import { MOCK_RATES } from './fixtures'

// Capture the chat-insert call (must NOT be reachable on mobile).
const state = vi.hoisted(() => ({ send: vi.fn(async () => {}) }))

vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ send: state.send }) }
})

const WidgetConverter = await import('~/pages/widget/converter.vue').then(m => m.default)
const IndexPage = await import('~/pages/index.vue').then(m => m.default)

/** Copy buttons by aria-label (widget uses en "Copy …", index uses ru "Скопировать …"). */
function copyButtons(wrapper: { findAll: (s: string) => Array<{ attributes: (k: string) => string | undefined }> }) {
  return wrapper.findAll('button').filter((b) => {
    const a = (b.attributes('aria-label') || '').toLowerCase()
    return a.includes('copy') || a.includes('скопиров')
  })
}

// b24ui's platform plugin seeds useState('platform') from the `BitrixMobile/…`
// User-Agent; seed it directly so useDevice().isBitrixMobile is true. The state
// is shared (createSharedComposable) — keep this in its own file and reset in
// afterEach so the `web`-assuming tests elsewhere aren't affected.
describe('Bitrix24 mobile app — clipboard/insert hidden (view-only)', () => {
  beforeEach(() => {
    localStorage.clear()
    useState('platform').value = { name: 'bitrix-mobile', version: '1' }
    vi.stubGlobal('$fetch', vi.fn(async () => MOCK_RATES))
    state.send.mockClear()
  })

  afterEach(() => {
    useState('platform').value = {}
    vi.unstubAllGlobals()
  })

  it('widget: no «Insert into chat», no copy buttons; rows still render', async () => {
    const wrapper = await mountSuspended(WidgetConverter)
    await flushPromises()

    expect(wrapper.text()).not.toContain('Insert into chat')
    expect(copyButtons(wrapper).length, 'no clipboard buttons on mobile').toBe(0)
    expect(wrapper.text()).toContain('BYN') // converter rows still shown
    expect(state.send).not.toHaveBeenCalled()
  })

  it('index: no copy buttons on mobile', async () => {
    const wrapper = await mountSuspended(IndexPage)
    await flushPromises()

    expect(copyButtons(wrapper).length, 'main page hides copy buttons on mobile').toBe(0)
  })
})
