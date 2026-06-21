import type { NbrbRate } from '~/utils/nbrb'

// Re-export the real cache key so the fixture can never drift from production
// when the version suffix is bumped in ratesCache.ts.
export { CACHE_KEY } from '~/utils/ratesCache'

/** Shared НБ РБ API response fixture for the Nuxt-environment tests. */
export const MOCK_RATES: NbrbRate[] = [
  { Cur_ID: 1, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'USD', Cur_Scale: 1, Cur_Name: 'Доллар', Cur_OfficialRate: 3.2 },
  { Cur_ID: 2, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'EUR', Cur_Scale: 1, Cur_Name: 'Евро', Cur_OfficialRate: 3.5 },
  { Cur_ID: 3, Date: '2026-06-04T00:00:00', Cur_Abbreviation: 'RUB', Cur_Scale: 100, Cur_Name: 'Рубль', Cur_OfficialRate: 3.6 }
]
