import { describe, expect, it } from 'vitest'
import ru from '../i18n/locales/ru.json'
import en from '../i18n/locales/en.json'

/** Collects dotted leaf-key paths from a locale object, sorted. */
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatKeys(v as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

// #98: `ru` and `en` are the two FULL locales (the other 17 are intentional
// minimal stubs that fall back to `en` — see i18n.config.ts). They must carry
// the SAME set of keys, so this catches "added a key to ru, forgot en" (and vice
// versa). The eslint `no-missing-keys` rule isn't used here: it would flood on
// the intentional partial stubs; this targeted comparison is precise and stable.
describe('i18n ru/en locale parity (#98)', () => {
  it('ru.json and en.json define exactly the same keys', () => {
    const ruKeys = flatKeys(ru as Record<string, unknown>)
    const enKeys = flatKeys(en as Record<string, unknown>)
    const missingFromEn = ruKeys.filter(k => !enKeys.includes(k))
    const missingFromRu = enKeys.filter(k => !ruKeys.includes(k))
    expect(missingFromEn, 'keys in ru.json missing from en.json').toEqual([])
    expect(missingFromRu, 'keys in en.json missing from ru.json').toEqual([])
  })
})
