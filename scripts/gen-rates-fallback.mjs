// Regenerates public/rates-fallback.json — a static "last known rates" snapshot
// the app falls back to when api.nbrb.by is unreachable on a cold load (issue
// #80: the live API is a single point of failure; the localStorage cache only
// helps returning visitors, not the first load). Run manually or from CI:
//
//   node scripts/gen-rates-fallback.mjs      (alias: pnpm rates:snapshot)
//
// The parse/merge logic mirrors app/utils/nbrb.ts (kept in sync by hand — this
// is a plain .mjs tool, it can't import the TS source without a build step).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DAILY_URL = 'https://api.nbrb.by/exrates/rates?periodicity=0'
const MONTHLY_URL = 'https://api.nbrb.by/exrates/rates?periodicity=1'
// Keep it short: this is a build/CI helper, not a user-facing request — a hung
// endpoint should fail fast, not stall the job.
const TIMEOUT_MS = 15_000

/** Mirror of parseNbrbRates: normalise usable records to `{ code, bynRate }`. */
export function parse(data) {
  if (!Array.isArray(data)) return []
  return data
    .filter(r => r && typeof r.Cur_Abbreviation === 'string'
      && Number.isFinite(r.Cur_Scale) && r.Cur_Scale > 0
      && Number.isFinite(r.Cur_OfficialRate) && r.Cur_OfficialRate > 0)
    .map(r => ({ code: r.Cur_Abbreviation, bynRate: r.Cur_OfficialRate / r.Cur_Scale }))
}

/** Mirror of mergeRates: daily (primary) wins; monthly fills codes it omits. */
export function merge(primary, fallback) {
  const codes = new Set(primary.map(e => e.code))
  return [...primary, ...fallback.filter(e => !codes.has(e.code))]
}

/** Builds the `{ date, rates }` snapshot from raw daily/monthly payloads. */
export function buildSnapshot(daily, monthly) {
  const rates = merge(parse(daily), parse(monthly))
  if (!rates.length) throw new Error('no usable rates parsed from NBRB feeds')
  // Store the raw ISO date; the app formats it (ru-RU) at load, same as live.
  const date = Array.isArray(daily) && daily[0]?.Date ? daily[0].Date : ''
  return { date, rates }
}

async function getJson(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const [daily, monthly] = await Promise.all([
    getJson(DAILY_URL),
    // Monthly is best-effort (carries RSD etc.); its failure must not abort.
    getJson(MONTHLY_URL).catch(() => [])
  ])
  const snapshot = buildSnapshot(daily, monthly)
  const out = fileURLToPath(new URL('../public/rates-fallback.json', import.meta.url))
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`rates-fallback: ${snapshot.rates.length} rates, date ${snapshot.date} → ${out}`)
}

// Run main() only when invoked directly — imports (seeding, tests) get the pure
// helpers above without triggering a network fetch.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('rates-fallback generation failed:', err.message)
    process.exit(1)
  })
}
