/**
 * Manual smoke check: verifies every currency in the catalogue
 * (`app/config/currencies.ts`) is actually reachable from a НБ РБ feed.
 *
 * Why this exists: most currencies live in the daily feed (`periodicity=0`), but
 * a few — e.g. the Serbian dinar (RSD) — are published only monthly
 * (`periodicity=1`). A catalogue row whose code is in neither feed renders as a
 * permanently blank row in production, and nothing else catches it (unit tests
 * use synthetic fixtures). Run this after adding a currency:
 *
 *   node scripts/check-currencies.mjs
 *
 * Exit code 0 = every catalogue currency resolves; 1 = at least one is missing.
 * Network-dependent (hits api.nbrb.by), so it is a manual tool, not part of CI.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const catalogue = readFileSync(join(here, '../app/config/currencies.ts'), 'utf-8')
const codes = [...catalogue.matchAll(/code:\s*'([A-Z]{3})'/g)].map(m => m[1])

/** Fetches the abbreviations present in one НБ РБ periodicity feed. */
async function feedCodes(periodicity) {
  const res = await fetch(`https://api.nbrb.by/exrates/rates?periodicity=${periodicity}`)
  if (!res.ok) throw new Error(`НБ РБ periodicity=${periodicity} → HTTP ${res.status}`)
  const data = await res.json()
  return new Set(data.map(r => r.Cur_Abbreviation))
}

const [daily, monthly] = await Promise.all([feedCodes(0), feedCodes(1)])

let ok = true
console.log('Currency catalogue vs. НБ РБ feeds:\n')
for (const code of codes) {
  if (code === 'BYN') {
    console.log(`  ${code}  —  base currency (not fetched)`)
  } else if (daily.has(code)) {
    console.log(`  ${code}  —  daily (periodicity=0)`)
  } else if (monthly.has(code)) {
    console.log(`  ${code}  —  monthly (periodicity=1)`)
  } else {
    console.log(`  ${code}  —  ✗ MISSING from both feeds — row would be blank!`)
    ok = false
  }
}
console.log(`\n${ok ? '✓ all catalogue currencies resolve' : '✗ some currencies are unreachable'}`)
process.exit(ok ? 0 : 1)
