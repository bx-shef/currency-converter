import { describe, expect, it } from 'vitest'
import {
  FOOTER_LINKS,
  ECOSYSTEM_TOOLS,
  CLIENT_BANK_LANDING_URL,
  CUSTOM_DEV_URL,
  isMarketplaceListing
} from '../app/utils/site'

describe('isMarketplaceListing', () => {
  it('is true only when a non-blank URL is configured — drives whether the promo card shows', () => {
    expect(isMarketplaceListing('https://www.bitrix24.ru/apps/app/shef.currency/')).toBe(true)
    // Empty/blank/nullish → card hidden (we never fabricate an /install link).
    expect(isMarketplaceListing('')).toBe(false)
    expect(isMarketplaceListing('  ')).toBe(false)
    expect(isMarketplaceListing(undefined)).toBe(false)
    expect(isMarketplaceListing(null)).toBe(false)
  })
})

describe('footer link lists', () => {
  const all = [...FOOTER_LINKS, ...ECOSYSTEM_TOOLS]

  it('every link has a unique id and an https href', () => {
    const ids = all.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const link of all) {
      expect(link.label.length).toBeGreaterThan(0)
      expect(link.href).toMatch(/^https:\/\//)
    }
  })

  it('does not self-link to the currency converter', () => {
    // The footer lists sibling tools, not this app — no self-link (task). Guard
    // the concept, not one literal domain: any `currency-converter`-flavoured
    // href or the "Конвертер валют" label would be a self-link. (The build-sha
    // link to the source repo lives outside these lists, so it's unaffected.)
    for (const link of all) {
      expect(link.href.toLowerCase()).not.toContain('currency-converter')
      expect(link.label.toLowerCase()).not.toContain('конвертер')
    }
  })

  it('links out to the client-bank landing among the tools', () => {
    expect(ECOSYSTEM_TOOLS.some(t => t.href === CLIENT_BANK_LANDING_URL)).toBe(true)
    expect(CLIENT_BANK_LANDING_URL).toMatch(/^https:\/\//)
  })
})

describe('custom-dev CTA', () => {
  it('points at the partner site brief', () => {
    expect(CUSTOM_DEV_URL).toMatch(/^https:\/\/offer\.bx-shef\.by/)
  })
})
