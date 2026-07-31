import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'

// Spy on router.replace so we can assert the standalone redirect.
const replaceSpy = vi.hoisted(() => vi.fn())
// Control whether the page believes it's inside a B24 frame.
const b24State = vi.hoisted(() => ({ inFrame: false }))

vi.mock('vue-router', async (orig) => {
  const actual = await orig<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ replace: replaceSpy }) }
})

vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ isInit: () => b24State.inFrame }) }
})

const InstallPage = await import('~/pages/install.vue').then(m => m.default)
const en = JSON.parse(readFileSync(join(process.cwd(), 'i18n/locales/en.json'), 'utf-8'))

describe('install.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    replaceSpy.mockClear()
    b24State.inFrame = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('standalone (no B24 frame): runs the mock progress and redirects to /', async () => {
    await mountSuspended(InstallPage)
    // onMounted → runInstall: waitForB24 resolves immediately (no window.name →
    // standalone), then the mock steps run ~3.8s (3×600ms + 2000ms) before
    // router.replace('/'). Drive all the timers.
    await vi.advanceTimersByTimeAsync(5000)
    expect(replaceSpy).toHaveBeenCalledWith('/')
  })

  it('in-frame marker but failed handshake: retryable error, NOT the mock redirect', async () => {
    // The portal always sets window.name on its iframes. If it's present but
    // init() produced no frame, the handshake failed transiently — silently
    // playing the standalone mock (with its redirect to /) would leave the
    // install unfinished with no retry. Expect the error state instead.
    window.name = 'b24-frame-marker'
    try {
      const wrapper = await mountSuspended(InstallPage)
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()

      expect(replaceSpy).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain(en.page.install.error.title)
      expect(wrapper.text()).toContain(en.page.install.error.handshake)
      expect(wrapper.text()).toContain(en.page.install.error.retry)
    } finally {
      window.name = ''
    }
  })

  it('inside a B24 frame, a failing install shows a retryable error, not a redirect (#86)', async () => {
    b24State.inFrame = true
    const wrapper = await mountSuspended(InstallPage)
    // isInit=true → waitForB24 returns at once; the real install flow's first step
    // (makeInit) calls portal methods the minimal mock frame lacks → throws →
    // caught → error state with a retry button (no sleeps precede the throw).
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    expect(replaceSpy).not.toHaveBeenCalled() // no standalone redirect when in-frame
    expect(wrapper.text()).toContain(en.page.install.error.title) // error state shown
    // The «retryable» part: the retry button renders (label) and is enabled again
    // (isRunning reset in the finally), so the user can re-run the install.
    expect(wrapper.text()).toContain(en.page.install.error.retry)
    expect(wrapper.find('button:not([disabled])').exists()).toBe(true)
  })
})
