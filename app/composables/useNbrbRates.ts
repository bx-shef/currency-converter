/**
 * Converter state + НБ РБ rate loading, extracted from the page `<script setup>`
 * (issue #48). Holds the reactive currency rows and exposes the input actions;
 * the pure pieces it leans on (`parseNbrbRates`, `parseCache`, `recalcFrom`)
 * are unit-tested on their own.
 */
import { onMounted, ref } from 'vue'
import { applyStep, recalcFrom } from '~/utils/converter'
import { parseNbrbRates, type NbrbRate, type RateEntry } from '~/utils/nbrb'
import { CACHE_KEY, parseCache, serializeCache, type CachedRates } from '~/utils/ratesCache'
import { createCurrencyRows, DEFAULT_AMOUNT, MAX_AMOUNT } from '~/config/currencies'

/** НБ РБ daily-rates endpoint (periodicity=0 → official rates). */
const RATES_URL = 'https://api.nbrb.by/exrates/rates?periodicity=0'
/** Cap the fetch so a hanging endpoint surfaces an error, not an endless spinner. */
const FETCH_TIMEOUT_MS = 10_000

export function useNbrbRates() {
  const currencies = ref(createCurrencyRows())
  const ratesDate = ref('')
  const loading = ref(true)
  const refreshing = ref(false)
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
    const active = currencies.value.find(c => c.code === activeCurrency.value)
    if (active && typeof active.value === 'number' && active.bynRate > 0) {
      currencies.value = recalcFrom(currencies.value, active.code, active.value)
    } else {
      activeCurrency.value = 'BYN'
      const byn = currencies.value.find(c => c.code === 'BYN')
      const amount = byn?.value ?? DEFAULT_AMOUNT
      currencies.value = recalcFrom(currencies.value, 'BYN', amount)
    }
  }

  /** Reads cached rates from localStorage; null when missing, stale, or unparsable. */
  function readCache(): CachedRates | null {
    // SSR guard; in-browser access errors (private mode, blocked storage) caught below.
    if (typeof localStorage === 'undefined') return null
    try {
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
      const data = await $fetch<NbrbRate[]>(RATES_URL, { timeout: FETCH_TIMEOUT_MS })
      const date = data[0]?.Date
        ? new Date(data[0].Date).toLocaleDateString('ru-RU')
        : ''
      const rateMap = parseNbrbRates(data)
      // Empty/garbage response would silently zero out every rate; surface it.
      if (!rateMap.length) throw new Error('NBRB API returned no usable rates')
      applyRates(rateMap, date)
      writeCache(date, rateMap)
    } catch {
      fetchError.value = 'Не удалось загрузить курсы НБ РБ. Попробуйте обновить страницу.'
    }
  }

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
