<script setup lang="ts">
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
  /** Raw user input string, kept as-is to preserve typing experience */
  value: string
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

const DEFAULT_CURRENCIES: CurrencyRow[] = [
  { code: 'USD', name: 'доллар США', bynRate: 0, value: '', removable: false },
  { code: 'EUR', name: 'евро', bynRate: 0, value: '', removable: false },
  { code: 'BYN', name: 'белорусский рубль', bynRate: 1, value: '1', removable: false },
  { code: 'RUB', name: 'российский рубль', bynRate: 0, value: '', removable: false },
  { code: 'CNY', name: 'китайский юань', bynRate: 0, value: '', removable: false },
  { code: 'TRY', name: 'турецкая лира', bynRate: 0, value: '', removable: true }
]

const currencies = ref<CurrencyRow[]>(DEFAULT_CURRENCIES.map(c => ({ ...c })))
const ratesDate = ref('')
const loading = ref(true)
const fetchError = ref('')
const activeCurrency = ref('BYN')

/** Formats a number to up to 4 decimal places, trimming trailing zeros. Returns '0' for zero. */
function formatValue(num: number): string {
  if (!isFinite(num) || isNaN(num)) return ''
  if (num === 0) return '0'
  return num.toFixed(4).replace(/\.?0+$/, '')
}

/** Recalculates all currency values based on `amount` units of `code`, using BYN as intermediary. */
function recalcFrom(code: string, amount: number) {
  const source = currencies.value.find(c => c.code === code)
  if (!source || source.bynRate === 0) return
  const bynAmount = amount * source.bynRate
  for (const c of currencies.value) {
    if (c.code !== code && c.bynRate > 0) {
      c.value = formatValue(bynAmount / c.bynRate)
    }
  }
}

function applyRates(rateMap: Array<{ code: string; bynRate: number }>, date: string) {
  for (const { code, bynRate } of rateMap) {
    const c = currencies.value.find(r => r.code === code)
    if (c) c.bynRate = bynRate
  }
  ratesDate.value = date
  recalcFrom('BYN', 1)
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

onMounted(async () => {
  const cached = loadFromCache()
  if (cached) {
    applyRates(cached.rates, cached.date)
    loading.value = false
    return
  }

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
  } finally {
    loading.value = false
  }
})

function onInput(code: string, event: Event) {
  const input = event.target as HTMLInputElement
  const raw = input.value

  if (raw.startsWith('-')) {
    input.value = ''
    const c = currencies.value.find(r => r.code === code)
    if (c) c.value = ''
    return
  }

  const normalized = raw.replace(',', '.')
  const num = parseFloat(normalized)
  activeCurrency.value = code
  const c = currencies.value.find(r => r.code === code)
  if (c) c.value = raw
  if (!normalized || isNaN(num)) return
  recalcFrom(code, num)
}

function removeCurrency(code: string) {
  currencies.value = currencies.value.filter(c => c.code !== code)
  if (activeCurrency.value === code) {
    activeCurrency.value = currencies.value.find(c => !c.removable)?.code ?? ''
  }
}
</script>

<template>
  <div class="flex justify-center px-4 py-8">
    <div class="w-full max-w-sm">
      <h1 class="mb-1 text-2xl font-bold text-gray-900 dark:text-white">
        Конвертер валют
      </h1>

      <p class="mb-1 text-sm font-medium text-blue-600 dark:text-blue-400">
        По курсу НБ РБ
      </p>

      <p
        v-if="ratesDate"
        class="mb-6 text-sm text-gray-500 dark:text-gray-400"
      >
        Официальный курс, устанавливаемый<br>
        Национальным банком Республики Беларусь<br>
        на {{ ratesDate }}
      </p>
      <div
        v-else-if="!loading"
        class="mb-6"
      />

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="overflow-hidden rounded border border-gray-200 dark:border-gray-700"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="h-[62px] animate-pulse border-b border-gray-200 bg-gray-100 last:border-b-0 dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <!-- Error state -->
      <div
        v-else-if="fetchError"
        class="rounded border border-red-200 p-4 text-sm text-red-500 dark:border-red-800"
      >
        {{ fetchError }}
      </div>

      <!-- Currency rows -->
      <div
        v-else
        class="overflow-hidden rounded border border-gray-200 dark:border-gray-700"
      >
        <div
          v-for="currency in currencies"
          :key="currency.code"
          class="relative border-b border-gray-200 transition-colors last:border-b-0 dark:border-gray-700"
          :class="currency.code === activeCurrency
            ? 'bg-gray-50 dark:bg-gray-900'
            : 'bg-white dark:bg-black'"
        >
          <div class="flex items-center gap-2 px-3 pb-1 pt-3">
            <span class="w-10 shrink-0 select-none text-sm font-semibold text-gray-500 dark:text-gray-400">
              {{ currency.code }}
            </span>
            <input
              :id="`input-${currency.code}`"
              :value="currency.value"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              class="min-w-0 flex-1 border-none bg-transparent text-lg text-gray-900 outline-none dark:text-white"
              @input="onInput(currency.code, $event)"
              @focus="activeCurrency = currency.code"
            >
            <button
              v-if="currency.removable"
              type="button"
              :aria-label="`Убрать ${currency.name}`"
              class="shrink-0 px-1 text-xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              @click="removeCurrency(currency.code)"
            >
              &times;
            </button>
          </div>
          <p class="px-3 pb-2 text-right text-xs text-gray-400 dark:text-gray-500">
            {{ currency.name }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
