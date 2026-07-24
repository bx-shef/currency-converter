import type { NbrbRate } from '~/utils/nbrb'

// Re-export the real cache key so the fixture can never drift from production
// when the version suffix is bumped in ratesCache.ts.
export { CACHE_KEY } from '~/utils/ratesCache'

// Daily feed fixture. Covers the three Cur_Scale shapes the app must normalise:
// 1 (USD/EUR), 100 (RUB), 10 (CNY/TRY) and 1000 (KZT) — so `bynRate =
// Cur_OfficialRate / Cur_Scale` is exercised for each (issue #83). RSD is
// intentionally absent here (it is monthly-only, see MOCK_MONTHLY_RATES) so a
// rate-less row stays blank until its rate loads.
/** Shared НБ РБ daily-feed (periodicity=0) fixture for the Nuxt-environment tests. */
export const MOCK_RATES: NbrbRate[] = [
  { Cur_ID: 1, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар', Cur_OfficialRate: 3.2 },
  { Cur_ID: 2, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'EUR', Cur_Scale: 1, Cur_Name: 'Евро', Cur_OfficialRate: 3.5 },
  { Cur_ID: 3, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_Name: 'Рубль', Cur_OfficialRate: 3.6 },
  { Cur_ID: 4, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'KZT', Cur_Scale: 1000, Cur_Name: 'Тенге', Cur_OfficialRate: 5.0 },
  { Cur_ID: 5, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'CNY', Cur_Scale: 10, Cur_Name: 'Юань', Cur_OfficialRate: 4.4 },
  { Cur_ID: 6, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'TRY', Cur_Scale: 10, Cur_Name: 'Лира', Cur_OfficialRate: 0.8 }
]

/**
 * НБ РБ monthly-feed (periodicity=1) fixture: currencies the daily feed omits.
 * RSD (Serbian dinar) is published only here; scale 100 mirrors the real API.
 */
export const MOCK_MONTHLY_RATES: NbrbRate[] = [
  { Cur_ID: 496, Date: '2026-06-01T00:00:00', Cur_Abbreviation: 'RSD', Cur_Scale: 100, Cur_Name: 'Сербских динаров', Cur_OfficialRate: 2.8198 }
]
