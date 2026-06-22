import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ru from '../i18n/locales/ru.json'
import en from '../i18n/locales/en.json'

/** Collects dotted leaf-key paths from a locale object, sorted. */
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const nested = flatKeys(v as Record<string, unknown>, path)
      // An empty object is itself a leaf — don't let it vanish from the key set.
      keys.push(...(nested.length ? nested : [path]))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

const localesDir = fileURLToPath(new URL('../i18n/locales', import.meta.url))
const localeFiles = readdirSync(localesDir).filter(f => f.endsWith('.json'))

// #98: `ru` and `en` are the two FULL locales (the other 17 are intentional
// minimal stubs that fall back to `en` — see i18n.config.ts). Catches
// "added a key to ru, forgot en" and a new language shipped without `app.title`.
// Orthogonal to the ESLint `no-unused-keys` rule (which catches keys defined but
// never used via t()); the eslint `no-missing-keys` rule isn't used because it
// would flood on the intentional partial stubs.
describe('i18n locales (#98)', () => {
  it('ru.json and en.json define exactly the same keys', () => {
    const ruKeys = flatKeys(ru as Record<string, unknown>)
    const enKeys = flatKeys(en as Record<string, unknown>)
    const enSet = new Set(enKeys)
    const ruSet = new Set(ruKeys)
    expect(ruKeys.filter(k => !enSet.has(k)), 'keys in ru.json missing from en.json').toEqual([])
    expect(enKeys.filter(k => !ruSet.has(k)), 'keys in en.json missing from ru.json').toEqual([])
  })

  it('every locale defines app.title (used as the widget name in LANG_ALL on placement.bind)', () => {
    const missing = localeFiles.filter((f) => {
      const json = JSON.parse(readFileSync(join(localesDir, f), 'utf-8')) as { app?: { title?: string } }
      return !json.app?.title
    })
    expect(missing, 'locale files without app.title').toEqual([])
  })
})
