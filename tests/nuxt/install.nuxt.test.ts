import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

// Spy on router.replace so we can assert the standalone redirect.
const replaceSpy = vi.hoisted(() => vi.fn())

vi.mock('vue-router', async (orig) => {
  const actual = await orig<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ replace: replaceSpy }) }
})

// Standalone: no B24 frame (isInit=false) → waitForB24 times out → mock progress.
vi.mock('~/composables/useB24', async () => {
  const { makeMockB24 } = await import('./helpers/mockB24')
  return { useB24: () => makeMockB24({ isInit: () => false }) }
})

const InstallPage = await import('~/pages/install.vue').then(m => m.default)

describe('install.vue — standalone (no B24 frame)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    replaceSpy.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the mock progress and redirects to /', async () => {
    await mountSuspended(InstallPage)
    // onMounted → runInstall: waitForB24 polls ~10s, then the mock steps run
    // ~3.8s (3×600ms + 2000ms) before router.replace('/'). Drive all the timers.
    await vi.advanceTimersByTimeAsync(14000)
    expect(replaceSpy).toHaveBeenCalledWith('/')
  })
})
