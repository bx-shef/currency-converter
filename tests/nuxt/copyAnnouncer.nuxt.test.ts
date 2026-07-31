import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import CopyAnnouncer from '~/components/CopyAnnouncer.vue'
import type { CopyState } from '~/utils/copyFeedback'

/**
 * The live region is the only channel that tells a screen-reader user whether a
 * copy worked — the buttons signal it by colour and by swapping their own
 * aria-label, and neither is announced. These tests cover the wiring, which is
 * what actually breaks; the pure text mapping is unit-tested separately.
 */
async function settle() {
  await nextTick()
  await nextTick()
}

describe('CopyAnnouncer', () => {
  it('renders an empty polite region before anything is copied', async () => {
    const wrapper = await mountSuspended(CopyAnnouncer, { props: { states: ['idle', 'idle'] } })
    const region = wrapper.get('[role="status"]')
    // Must exist up front: a region created at announce time is not read out.
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.text()).toBe('')
  })

  it('announces a successful copy', async () => {
    const wrapper = await mountSuspended(CopyAnnouncer, { props: { states: ['idle'] } })
    await wrapper.setProps({ states: ['ok'] as CopyState[] })
    await settle()
    expect(wrapper.get('[role="status"]').text()).toBe('Скопировано')
  })

  it('a still-flashing success never masks a later failure', async () => {
    // The regression that made this component worth reviewing: picking the first
    // non-idle state announced "Скопировано" for a copy that had just failed.
    const wrapper = await mountSuspended(CopyAnnouncer, { props: { states: ['idle', 'idle'] } })
    await wrapper.setProps({ states: ['ok', 'idle'] as CopyState[] })
    await settle()
    expect(wrapper.get('[role="status"]').text()).toBe('Скопировано')

    await wrapper.setProps({ states: ['ok', 'err'] as CopyState[] }) // first flash still on
    await settle()
    expect(wrapper.get('[role="status"]').text()).toBe('Не удалось скопировать')
  })

  it('re-announces a second copy by clearing the region first', async () => {
    const wrapper = await mountSuspended(CopyAnnouncer, { props: { states: ['idle', 'idle'] } })
    await wrapper.setProps({ states: ['ok', 'idle'] as CopyState[] })
    await settle()

    // A different button succeeds while the text would stay identical — the
    // region has to blank and refill, or assistive tech stays silent.
    await wrapper.setProps({ states: ['ok', 'ok'] as CopyState[] })
    await nextTick()
    expect(wrapper.get('[role="status"]').text()).toBe('')
    await settle()
    expect(wrapper.get('[role="status"]').text()).toBe('Скопировано')
  })

  it('uses the labels it is given (the widget passes localized ones)', async () => {
    const wrapper = await mountSuspended(CopyAnnouncer, {
      props: { states: ['idle'], okLabel: 'Copied', errLabel: 'Couldn\'t copy' }
    })
    await wrapper.setProps({ states: ['err'] as CopyState[] })
    await settle()
    expect(wrapper.get('[role="status"]').text()).toBe('Couldn\'t copy')
  })
})
