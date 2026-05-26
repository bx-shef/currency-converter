import { convert } from '~/utils/converter'

interface NbrbRate {
  Cur_ID: number
  Date: string
  Cur_Abbreviation: string
  Cur_Scale: number
  Cur_Name: string
  Cur_OfficialRate: number
}

export interface CurrencyRow {
  code: string
  /** Localized display name (resolved against i18n with a Russian fallback). */
  name: string
  /** BYN per 1 unit of this currency; always 1 for BYN itself. */
  bynRate: number
  /** Current amount entered or calculated for this currency. */
  value: number | undefined
  removable: boolean
}

interface CachedRates {
  date: string
  rates: Array<{ code: string, bynRate: number }>
  timestamp: number
}

const CACHE_KEY = 'nbrb_rates'
/** НБ РБ updates rates once per business day; cache for 12 hours */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
export const STEP = 100

interface DefaultCurrency {
  code: string
  fallbackName: string
  removable: boolean
}

const DEFAULT_CURRENCIES: DefaultCurrency[] = [
  { code: 'USD', fallbackName: 'доллар США', removable: false },
  { code: 'EUR', fallbackName: 'евро', removable: false },
  { code: 'BYN', fallbackName: 'белорусский рубль', removable: false },
  { code: 'RUB', fallbackName: 'российский рубль', removable: false },
  { code: 'CNY', fallbackName: 'китайский юань', removable: false },
  { code: 'TRY', fallbackName: 'турецкая лира', removable: false }
]

export function useCurrencyConverter() {
  const { t, te } = useI18n()

  function nameOf(code: string, fallback: string): string {
    const key = `app.currencies.${code}`
    return te(key) ? t(key) : fallback
  }

  function buildInitialRows(): CurrencyRow[] {
    return DEFAULT_CURRENCIES.map(c => ({
      code: c.code,
      name: nameOf(c.code, c.fallbackName),
      bynRate: c.code === 'BYN' ? 1 : 0,
      value: c.code === 'BYN' ? STEP : undefined,
      removable: c.removable
    }))
  }

  const currencies = ref<CurrencyRow[]>(buildInitialRows())
  const ratesDate = ref('')
  const loading = ref(true)
  const refreshing = ref(false)
  const fetchError = ref('')
  const activeCurrency = ref('BYN')

  function recalcFrom(code: string, amount: number) {
    const source = currencies.value.find(c => c.code === code)
    if (!source) return
    for (const c of currencies.value) {
      if (c.code !== code) {
        c.value = convert(amount, source.bynRate, c.bynRate)
      }
    }
  }

  function applyRates(rateMap: Array<{ code: string, bynRate: number }>, date: string) {
    for (const { code, bynRate } of rateMap) {
      const c = currencies.value.find(r => r.code === code)
      if (c) c.bynRate = bynRate
    }
    ratesDate.value = date
    const active = currencies.value.find(c => c.code === activeCurrency.value)
    if (active && typeof active.value === 'number' && active.bynRate > 0) {
      recalcFrom(active.code, active.value)
    } else {
      activeCurrency.value = 'BYN'
      const byn = currencies.value.find(c => c.code === 'BYN')
      if (byn) byn.value = byn.value ?? STEP
      recalcFrom('BYN', byn?.value ?? STEP)
    }
  }

  function loadFromCache(): CachedRates | null {
    if (typeof sessionStorage === 'undefined') return null
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (!raw) return null
      const cached = JSON.parse(raw) as CachedRates
      if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null
      return cached
    } catch {
      return null
    }
  }

  function saveToCache(date: string, rates: Array<{ code: string, bynRate: number }>) {
    if (typeof sessionStorage === 'undefined') return
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ date, rates, timestamp: Date.now() }))
    } catch {
      // sessionStorage may be unavailable (private browsing, quota exceeded)
    }
  }

  async function fetchRates() {
    fetchError.value = ''
    try {
      const data = await $fetch<NbrbRate[]>('https://api.nbrb.by/exrates/rates?periodicity=0')
      const date = data[0]?.Date
        ? new Date(data[0].Date).toLocaleDateString('ru-RU')
        : ''
      const rateMap = data
        .filter(r => r.Cur_Scale > 0)
        .map(r => ({ code: r.Cur_Abbreviation, bynRate: r.Cur_OfficialRate / r.Cur_Scale }))
      applyRates(rateMap, date)
      saveToCache(date, rateMap)
    } catch {
      fetchError.value = t('app.fetchError')
    }
  }

  async function refresh() {
    if (loading.value || refreshing.value) return
    refreshing.value = true
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(CACHE_KEY)
      } catch {
        // ignore unavailable sessionStorage
      }
    }
    await fetchRates()
    refreshing.value = false
  }

  async function bootstrap() {
    fetchError.value = ''
    const cached = loadFromCache()
    if (cached) {
      applyRates(cached.rates, cached.date)
      loading.value = false
      return
    }
    await fetchRates()
    loading.value = false
  }

  function onValueUpdate(code: string, value: number | null | undefined) {
    const c = currencies.value.find(r => r.code === code)
    if (!c) return
    const normalized = value == null || (typeof value === 'number' && isNaN(value))
      ? undefined
      : value
    c.value = normalized
    activeCurrency.value = code
    if (typeof normalized === 'number') {
      recalcFrom(code, normalized)
    }
  }

  function removeCurrency(code: string) {
    currencies.value = currencies.value.filter(c => c.code !== code)
    if (activeCurrency.value === code) {
      activeCurrency.value = currencies.value.find(c => !c.removable)?.code ?? ''
    }
  }

  return {
    currencies,
    ratesDate,
    loading,
    refreshing,
    fetchError,
    activeCurrency,
    bootstrap,
    refresh,
    onValueUpdate,
    removeCurrency
  }
}
