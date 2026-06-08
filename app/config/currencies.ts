/**
 * Currency catalogue for the converter UI.
 * Plain data + types — no Vue/state dependency, so the catalogue is testable
 * and reusable. Adding a row here is all it takes to support a new currency:
 * `parseNbrbRates` returns every code the НБ РБ API provides, and `bynRate`
 * is filled in on load.
 */

/** A currency row rendered in the converter. */
export interface CurrencyRow {
  code: string
  name: string
  /** BYN per 1 unit of this currency; always 1 for BYN itself. */
  bynRate: number
  /** Current amount entered or calculated for this currency. */
  value: number | undefined
}

/** Amount pre-filled for the base currency (BYN) on first load. */
export const DEFAULT_AMOUNT = 100

/**
 * Upper bound for an input — keeps `value * rate` away from
 * `Number.MAX_SAFE_INTEGER` for every supported currency.
 */
export const MAX_AMOUNT = 1e12

/** Display order + RU names. `bynRate`/`value` are seeded; rates load from the API. */
export const DEFAULT_CURRENCIES: readonly CurrencyRow[] = [
  { code: 'BYN', name: 'белорусский рубль', bynRate: 1, value: DEFAULT_AMOUNT },
  { code: 'RUB', name: 'российский рубль', bynRate: 0, value: undefined },
  { code: 'KZT', name: 'казахстанский тенге', bynRate: 0, value: undefined },
  { code: 'CNY', name: 'китайский юань', bynRate: 0, value: undefined },
  { code: 'TRY', name: 'турецкая лира', bynRate: 0, value: undefined },
  { code: 'USD', name: 'доллар США', bynRate: 0, value: undefined },
  { code: 'EUR', name: 'евро', bynRate: 0, value: undefined }
]

/** Fresh, mutable copy of the default rows for component state. */
export function createCurrencyRows(): CurrencyRow[] {
  return DEFAULT_CURRENCIES.map(c => ({ ...c }))
}
