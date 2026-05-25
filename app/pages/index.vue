<script setup lang="ts">
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'

interface NbrbRate {
  Cur_ID: number
  Date: string
  Cur_Abbreviation: string
  Cur_Scale: number
  Cur_Name: string
  Cur_OfficialRate: number
}

/** Currency row shown in the converter UI */
interface CurrencyRow {
  code: string
  name: string
  /** BYN per 1 unit of this currency; always 1 for BYN itself */
  bynRate: number
  /** Current amount entered or calculated for this currency */
  value: number | undefined
  removable: boolean
}

interface CachedRates {
  date: string
  rates: Array<{ code: string; bynRate: number }>
  timestamp: number
}

const CACHE_KEY = 'nbrb_rates'
/** НБ РБ updates rates once per business day; cache for 12 hours */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const STEP = 100

const DEFAULT_CURRENCIES: CurrencyRow[] = [
  { code: 'USD', name: 'доллар США', bynRate: 0, value: undefined, removable: false },
  { code: 'EUR', name: 'евро', bynRate: 0, value: undefined, removable: false },
  { code: 'BYN', name: 'белорусский рубль', bynRate: 1, value: STEP, removable: false },
  { code: 'RUB', name: 'российский рубль', bynRate: 0, value: undefined, removable: false },
  { code: 'CNY', name: 'китайский юань', bynRate: 0, value: undefined, removable: false },
  { code: 'TRY', name: 'турецкая лира', bynRate: 0, value: undefined, removable: false }
]

const currencies = ref<CurrencyRow[]>(DEFAULT_CURRENCIES.map(c => ({ ...c })))
const ratesDate = ref('')
const loading = ref(true)
const refreshing = ref(false)
const fetchError = ref('')
const activeCurrency = ref('BYN')

/** Rounds to 4 decimal places and removes floating-point noise. */
function roundValue(num: number): number | undefined {
  if (!isFinite(num) || isNaN(num)) return undefined
  return Math.round(num * 10000) / 10000
}

/** Recalculates all currency values based on `amount` units of `code`, using BYN as intermediary. */
function recalcFrom(code: string, amount: number) {
  const source = currencies.value.find(c => c.code === code)
  if (!source || source.bynRate === 0) return
  const bynAmount = amount * source.bynRate
  for (const c of currencies.value) {
    if (c.code !== code && c.bynRate > 0) {
      c.value = roundValue(bynAmount / c.bynRate)
    }
  }
}

function applyRates(rateMap: Array<{ code: string; bynRate: number }>, date: string) {
  for (const { code, bynRate } of rateMap) {
    const c = currencies.value.find(r => r.code === code)
    if (c) c.bynRate = bynRate
  }
  ratesDate.value = date
  const active = currencies.value.find(c => c.code === activeCurrency.value)
  recalcFrom(active?.code ?? 'BYN', active?.value ?? STEP)
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

function saveToCache(date: string, rates: Array<{ code: string; bynRate: number }>) {
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
    fetchError.value = 'Не удалось загрузить курсы НБ РБ. Попробуйте обновить страницу.'
  }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_KEY)
    } catch {
      // sessionStorage may be unavailable
    }
  }
  await fetchRates()
  refreshing.value = false
}

onMounted(async () => {
  const cached = loadFromCache()
  if (cached) {
    applyRates(cached.rates, cached.date)
    loading.value = false
    return
  }
  await fetchRates()
  loading.value = false
})

function onValueUpdate(code: string, value: number | undefined) {
  const c = currencies.value.find(r => r.code === code)
  if (!c) return
  c.value = value
  activeCurrency.value = code
  if (typeof value === 'number' && !isNaN(value)) {
    recalcFrom(code, value)
  }
}

function removeCurrency(code: string) {
  currencies.value = currencies.value.filter(c => c.code !== code)
  if (activeCurrency.value === code) {
    activeCurrency.value = currencies.value.find(c => !c.removable)?.code ?? ''
  }
}
</script>

<template>
  <div class="flex justify-center px-3 py-3 sm:py-6">
    <div class="w-full max-w-sm">
      <div class="mb-2 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h1 class="text-lg font-bold leading-tight text-gray-900 dark:text-white sm:text-2xl">
            Конвертер валют
          </h1>
          <p class="text-xs font-medium text-blue-600 dark:text-blue-400 sm:text-sm">
            По курсу НБ РБ<span
              v-if="ratesDate"
              class="text-gray-500 dark:text-gray-400"
            > · на {{ ratesDate }}</span>
          </p>
        </div>
        <B24Button
          aria-label="Обновить курсы"
          color="air-tertiary-no-accent"
          size="sm"
          :icon="RefreshIcon"
          :loading="refreshing"
          :disabled="loading"
          @click="refresh"
        />
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="overflow-hidden rounded border border-gray-200 dark:border-gray-700"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="h-12 animate-pulse border-b border-gray-200 bg-gray-100 last:border-b-0 dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <!-- Error state -->
      <div
        v-else-if="fetchError"
        class="rounded border border-red-200 p-3 text-sm text-red-500 dark:border-red-800"
      >
        {{ fetchError }}
      </div>

      <!-- Currency rows -->
      <div
        v-else
        class="flex flex-col gap-1.5"
      >
        <div
          v-for="currency in currencies"
          :key="currency.code"
          class="flex items-center gap-2 transition-colors"
        >
          <div class="flex w-16 shrink-0 flex-col leading-tight">
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {{ currency.code }}
            </span>
            <span class="truncate text-[10px] text-gray-400 dark:text-gray-500">
              {{ currency.name }}
            </span>
          </div>
          <B24InputNumber
            :model-value="currency.value"
            :step="STEP"
            :min="0"
            :highlight="currency.code === activeCurrency"
            size="sm"
            class="min-w-0 flex-1"
            :ui="{ base: 'text-right' }"
            @update:model-value="onValueUpdate(currency.code, $event)"
            @focus="activeCurrency = currency.code"
          />
          <B24Button
            v-if="currency.removable"
            type="button"
            :aria-label="`Убрать ${currency.name}`"
            color="air-tertiary-no-accent"
            size="sm"
            @click="removeCurrency(currency.code)"
          >
            &times;
          </B24Button>
        </div>
      </div>
    </div>
  </div>
</template>
