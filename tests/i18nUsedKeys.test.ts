import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Matches a static i18n key in `t('a.b.c')` / `$t("a.b.c")` (either quote, ignores extra args). */
const T_KEY = /\$?\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1/g

/** Whether a dotted key path resolves to a value in the locale object. */
function hasKey(obj: unknown, dotted: string): boolean {
  return dotted.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj
  ) !== undefined
}

/** Tracked .ts/.vue under app/ (incl. top-level) — naturally excludes node_modules/.nuxt.
 *  Lists the whole tree and filters by extension; a `**` glob misses top-level files. */
function sourceFiles(): string[] {
  return execSync('git ls-files app', { cwd: repoRoot })
    .toString().trim().split('\n')
    .filter(f => f.endsWith('.ts') || f.endsWith('.vue'))
}

// #104: catches a key used in code (typo / removed from both locales) that the
// ru↔en parity test misses (both locales lacking it look "in sync") and that
// vue-i18n swallows silently at runtime (missingWarn:false). Every static t()
// key must exist in en.json — the fallback source; parity already ties ru to en.
// Scope & limits (all currently harmless, no dynamic keys / double quotes / other
// dirs in the codebase): scans app/ only; matches `t('...')` mentioned in comments
// too — so keep comment key-refs accurate, or a renamed key fails here.
describe('i18n key coverage (#104)', () => {
  it('every static t() key used in app/ exists in en.json', () => {
    const used = new Set<string>()
    for (const f of sourceFiles()) {
      const src = readFileSync(join(repoRoot, f), 'utf-8')
      for (const m of src.matchAll(T_KEY)) used.add(m[2]) // m[1] is the quote, m[2] the key
    }
    expect(used.size, 'sanity: some t() keys were found').toBeGreaterThan(0)
    const missing = [...used].filter(k => !hasKey(en, k)).sort()
    expect(missing, 'keys used via t() but missing from en.json').toEqual([])
  })
})
