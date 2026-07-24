import { describe, expect, it } from 'vitest'
import { parse, merge, buildSnapshot } from '../scripts/gen-rates-fallback.mjs'

// The fallback generator (scripts/gen-rates-fallback.mjs) is a plain .mjs tool
// that can't import the TS source, so its parse/merge duplicate app/utils/nbrb.ts
// "by hand". These tests lock that mirror: if nbrb.ts's validation changes, the
// generator would silently drift and could emit a parsable-but-wrong snapshot.
describe('gen-rates-fallback helpers (hand-mirror of utils/nbrb.ts)', () => {
  it('parse: keeps usable records, normalises by scale, drops bad ones', () => {
    const out = parse([
      { Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_OfficialRate: 3.2 },
      { Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_OfficialRate: 3.6 },
      { Cur_Abbreviation: 'BAD', Cur_Scale: 0, Cur_OfficialRate: 5 }, // scale 0 → dropped
      { Cur_Abbreviation: 'NEG', Cur_Scale: 1, Cur_OfficialRate: -1 }, // rate < 0 → dropped
      { Cur_Scale: 1, Cur_OfficialRate: 1 } // no code → dropped
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ code: 'USD', bynRate: 3.2 })
    expect(out[1].code).toBe('RUB')
    expect(out[1].bynRate).toBeCloseTo(0.036, 10) // 3.6 / 100, tolerant of FP noise
  })

  it('parse: non-array input → []', () => {
    expect(parse(null)).toEqual([])
    expect(parse({})).toEqual([])
    expect(parse(undefined)).toEqual([])
  })

  it('merge: primary (daily) wins; fallback (monthly) fills only missing codes', () => {
    expect(merge(
      [{ code: 'USD', bynRate: 3.2 }],
      [{ code: 'USD', bynRate: 9.9 }, { code: 'RSD', bynRate: 0.028 }]
    )).toEqual([
      { code: 'USD', bynRate: 3.2 }, // daily kept over monthly's 9.9
      { code: 'RSD', bynRate: 0.028 } // monthly-only code filled in
    ])
  })

  it('buildSnapshot: { date, rates } from raw feeds — daily date, merged rates', () => {
    const snap = buildSnapshot(
      [{ Date: '2026-07-24T00:00:00', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_OfficialRate: 3.2 }],
      [{ Cur_Abbreviation: 'RSD', Cur_Scale: 100, Cur_OfficialRate: 2.8 }]
    )
    expect(snap.date).toBe('2026-07-24T00:00:00')
    expect(snap.rates).toHaveLength(2)
    expect(snap.rates[0]).toEqual({ code: 'USD', bynRate: 3.2 })
    expect(snap.rates[1].code).toBe('RSD')
    expect(snap.rates[1].bynRate).toBeCloseTo(0.028, 10) // 2.8 / 100
  })

  it('buildSnapshot: throws when no usable rates parsed', () => {
    expect(() => buildSnapshot([], [])).toThrow(/no usable rates/)
  })
})
