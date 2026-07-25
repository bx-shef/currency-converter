import { describe, expect, it, vi } from 'vitest'
import { buildLangAll } from '../app/utils/langAll'

const LOCALES = [{ code: 'ru' }, { code: 'en' }, { code: 'de' }] as const

describe('buildLangAll', () => {
  it('maps every locale to a TITLE — current locale directly, others via locale override', () => {
    const t = vi.fn((_key: string, _named?: Record<string, unknown>, opts?: { locale: string }) =>
      opts ? `title-${opts.locale}` : 'title-current')

    const out = buildLangAll(LOCALES, 'ru', t)

    expect(Object.keys(out)).toEqual(['ru', 'en', 'de']) // all locales present
    expect(out.ru.TITLE).toBe('title-current') // active locale → plain t()
    expect(out.en.TITLE).toBe('title-en') // others → { locale } override
    expect(out.de.TITLE).toBe('title-de')
  })

  it('never throws when a per-locale resolution fails — falls back to the current-locale title', () => {
    const t = vi.fn((_key: string, _named?: Record<string, unknown>, opts?: { locale: string }) => {
      if (opts?.locale === 'de') throw new Error('missing locale bundle')
      return opts ? `title-${opts.locale}` : 'CURRENT'
    })

    const out = buildLangAll(LOCALES, 'ru', t)

    expect(out.de.TITLE).toBe('CURRENT') // threw → fell back, did not abort the map
    expect(out.en.TITLE).toBe('title-en') // unaffected
    expect(Object.keys(out)).toHaveLength(3)
  })

  it('resolves the fallback title once, not per locale', () => {
    const t = vi.fn((_key: string, _named?: Record<string, unknown>, opts?: { locale: string }) =>
      opts ? `t-${opts.locale}` : 'CUR')
    buildLangAll(LOCALES, 'ru', t)
    // 1 call for the fallback + 1 per non-current locale (en, de) = 3.
    expect(t).toHaveBeenCalledTimes(3)
  })
})
