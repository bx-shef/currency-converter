import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useColorMode } from '#imports'

/** Runs a composable inside a mounted component and returns its result. */
async function runComposable<T>(fn: () => T): Promise<T> {
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = fn()
      return () => null
    }
  })
  await mountSuspended(Comp)
  return result
}

// Regression for the broken theme toggle: b24ui's useColorMode reads top-level
// appConfig keys, so without app.config.ts (colorMode: true) it returned a no-op
// stub and B24ColorModeButton did nothing.
describe('color mode (theme toggle wiring)', () => {
  afterEach(() => {
    document.documentElement.className = ''
    localStorage.clear()
  })

  it('is enabled — not the forced no-op stub', async () => {
    const cm = await runComposable(() => useColorMode())
    expect(cm.forced).toBeFalsy()
    expect(typeof cm.value).toBe('string')
  })

  it('switches the <html> class when the preference changes', async () => {
    const cm = await runComposable(() => useColorMode())

    cm.preference = 'dark'
    await flushPromises()
    await nextTick()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    // Persisted under the key the inline theme-init script (app.vue) reads.
    expect(localStorage.getItem('vueuse-color-scheme')).toBe('dark')

    cm.preference = 'light'
    await flushPromises()
    await nextTick()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
