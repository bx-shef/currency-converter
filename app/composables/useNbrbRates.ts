/**
 * Converter state + НБ РБ rate loading, extracted from the page `<script setup>`
 * (issue #48). Holds the reactive currency rows and exposes the input actions;
 * the pure pieces it leans on (`parseNbrbRates`, `parseCache`, `recalcFrom`)
 * are unit-tested on their own.
 */
import { onMounted, ref } from 'vue'
import { applyStep, recalcFrom, resolveRecalcSource } from '~/utils/converter'
import { mergeRates, parseNbrbRates, type NbrbRate, type RateEntry } from '~/utils/nbrb'
import { CACHE_KEY, parseCache, serializeCache, type CachedRates } from '~/utils/ratesCache'
import { createCurrencyRows, DEFAULT_AMOUNT, MAX_AMOUNT } from '~/config/currencies'

/** НБ РБ daily-rates endpoint (periodicity=0 → official rates, updated daily). */
const DAILY_RATES_URL = 'https://api.nbrb.by/exrates/rates?periodicity=0'
/**
 * НБ РБ monthly-rates endpoint (periodicity=1). Carries currencies the daily
 * feed omits — e.g. the Serbian dinar (RSD) — so we merge it in as a fallback.
 */
const MONTHLY_RATES_URL = 'https://api.nbrb.by/exrates/rates?periodicity=1'
/** Cap the fetch so a hanging endpoint surfaces an error, not an endless spinner. */
const FETCH_TIMEOUT_MS = 10_000

/**
 * Converter state for the page: reactive currency rows, load status and input
 * actions. Loads rates from cache or the API on mount.
 * @returns status refs (`currencies`, `ratesDate`, `loading`, `refreshing`,
 *   `fetchError`, `activeCurrency`) and actions (`refresh`, `onValueUpdate`,
 *   `onRowClick`, `incrementCurrency`, `decrementCurrency`).
 */
export function useNbrbRates() {
  const currencies = ref(createCurrencyRows())
  const ratesDate = ref('')
  const loading = ref(true)
  const refreshing = ref(false)
  // Error *code*, not a user message: empty = no error, 'load' = rates failed to
  // load. The view maps it to a localized string (t('app.fetchError')) — the
  // composable stays framework-agnostic (no useI18n).
  const fetchError = ref('')
  const activeCurrency = ref('BYN')

  /**
   * Applies fetched BYN-rates to the rows and recomputes values. Keeps the
   * active currency as the conversion source when its rate is available;
   * otherwise falls back to BYN with the default amount (e.g. when rates load
   * before any input).
   */
  function applyRates(rateMap: RateEntry[], date: string) {
    for (const { code, bynRate } of rateMap) {
      const c = currencies.value.find(r => r.code === code)
      if (c) c.bynRate = bynRate
    }
    ratesDate.value = date
    const { code, amount } = resolveRecalcSource(currencies.value, activeCurrency.value, DEFAULT_AMOUNT)
    activeCurrency.value = code
    currencies.value = recalcFrom(currencies.value, code, amount)
  }

  /** Reads cached rates from localStorage; null when missing, stale, or unparsable. */
  function readCache(): CachedRates | null {
    if (typeof localStorage === 'undefined') return null // SSR guard
    try {
      // localStorage.getItem can throw (SecurityError in blocked/partitioned
      // storage); parseCache itself never throws.
      return parseCache(localStorage.getItem(CACHE_KEY), Date.now())
    } catch {
      return null
    }
  }

  /** Persists rates to localStorage; silently no-ops when storage is unavailable. */
  function writeCache(date: string, rates: RateEntry[]) {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(CACHE_KEY, serializeCache(date, rates, Date.now()))
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
  }

  async function fetchRates() {
    fetchError.value = ''
    try {
      // The daily feed is authoritative and required; the monthly feed only
      // fills currencies the daily one omits (e.g. RSD), so it is best-effort —
      // its failure leaves those rows blank but must not fail the whole load.
      const [daily, monthly] = await Promise.all([
        $fetch<NbrbRate[]>(DAILY_RATES_URL, { timeout: FETCH_TIMEOUT_MS }),
        $fetch<NbrbRate[]>(MONTHLY_RATES_URL, { timeout: FETCH_TIMEOUT_MS }).catch(() => [] as NbrbRate[])
      ])
      // Guard against a malformed/missing `Date`: `new Date('garbage')` yields an
      // Invalid Date whose `toLocaleDateString` is the literal "Invalid Date",
      // which would otherwise reach the UI. Fall back to an empty label instead.
      // The label follows the daily feed; a monthly-only rate (RSD) is shown
      // under that date — an accepted simplification (see CLAUDE.md).
      const parsedDate = daily[0]?.Date ? new Date(daily[0].Date) : null
      const date = parsedDate && !isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleDateString('ru-RU')
        : ''
      const rateMap = mergeRates(parseNbrbRates(daily), parseNbrbRates(monthly))
      // Empty/garbage response would silently zero out every rate; surface it.
      if (!rateMap.length) throw new Error('NBRB API returned no usable rates')
      applyRates(rateMap, date)
      writeCache(date, rateMap)
    } catch {
      fetchError.value = 'load'
    }
  }

  /** Clears the cache and refetches; ignored while a load is already running. */
  async function refresh() {
    if (loading.value || refreshing.value) return
    refreshing.value = true
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(CACHE_KEY)
      } catch {
        // localStorage may be unavailable
      }
    }
    await fetchRates()
    refreshing.value = false
  }

  /**
   * Handles input on a currency field: normalizes null/NaN to `undefined`, makes
   * the row active, and recomputes the other rows from it (a cleared field
   * leaves the rest untouched).
   */
  function onValueUpdate(code: string, value: number | null | undefined) {
    const c = currencies.value.find(r => r.code === code)
    if (!c) return
    const normalized = value == null || (typeof value === 'number' && isNaN(value))
      ? undefined
      : value
    c.value = normalized
    activeCurrency.value = code
    if (typeof normalized === 'number') {
      currencies.value = recalcFrom(currencies.value, code, normalized)
    }
  }

  function onRowClick(code: string) {
    activeCurrency.value = code
  }

  /** Increments the given currency by one adaptive step, clamped to MAX_AMOUNT. */
  function incrementCurrency(code: string) {
    const c = currencies.value.find(r => r.code === code)
    if (!c) return
    onValueUpdate(code, Math.min(applyStep(c.value, 1), MAX_AMOUNT))
  }

  /** Decrements the given currency by one adaptive step, clamped to 0. */
  function decrementCurrency(code: string) {
    const c = currencies.value.find(r => r.code === code)
    if (!c) return
    onValueUpdate(code, Math.max(applyStep(c.value, -1), 0))
  }

  onMounted(async () => {
    fetchError.value = ''
    const cached = readCache()
    if (cached) {
      applyRates(cached.rates, cached.date)
      loading.value = false
      return
    }
    await fetchRates()
    loading.value = false
  })

  return {
    currencies,
    ratesDate,
    loading,
    refreshing,
    fetchError,
    activeCurrency,
    refresh,
    onValueUpdate,
    onRowClick,
    incrementCurrency,
    decrementCurrency
  }
}
