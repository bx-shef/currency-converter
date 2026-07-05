import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import ConverterPromo from '~/components/ConverterPromo.vue'
import AppInBitrixCard from '~/components/AppInBitrixCard.vue'
import CustomDevCard from '~/components/CustomDevCard.vue'

// The partner brief URL used to be an exported constant (CUSTOM_DEV_URL) covered
// by tests/site.test.ts. It moved inline into CustomDevCard when the card was
// extracted, so re-assert it here — otherwise a typo in a conversion CTA would
// only be caught by a human eyeballing a screenshot.
describe('CustomDevCard', () => {
  it('CTA links to the ИП Шевчик brief anchor', async () => {
    const wrapper = await mountSuspended(CustomDevCard)
    const hrefs = wrapper.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('https://offer.bx-shef.by/#brief')
  })
})

// Guards the fix-commit (387db47): the card must fire its own market_card_click,
// not the component default market_click — otherwise its clicks are indistinguishable
// from any generic hero/nav Marketplace link in the ecosystem's analytics.
describe('ConverterPromo → AppInBitrixCard', () => {
  it('passes the card-specific goal market_card_click', async () => {
    const wrapper = await mountSuspended(ConverterPromo)
    await flushPromises()
    const card = wrapper.findComponent(AppInBitrixCard)
    expect(card.exists()).toBe(true)
    expect(card.props('clickGoal')).toBe('market_card_click')
  })
})
