<script setup lang="ts">
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import { convert, stepFor } from '~/utils/converter'
import { bynAmountInWords } from '~/utils/numberToWords'

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
  rates: Array<{ code: string, bynRate: number }>
  timestamp: number
}

const CACHE_KEY = 'nbrb_rates'
/** НБ РБ updates rates once per business day; cache for 12 hours */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const DEFAULT_AMOUNT = 100
/** Upper bound for input — keeps `value * rate` away from Number.MAX_SAFE_INTEGER. */
const MAX_AMOUNT = 1e12
/** Visual feedback duration after copy / copy error. */
const COPY_FEEDBACK_MS = 1500
/** Formula factor: (X − 20%) × 20% ≡ X × 0.8 × 0.2 ≡ X × 0.16. Spec'd by the page owner. */
const FORMULA_FACTOR = 0.16

const DEFAULT_CURRENCIES: CurrencyRow[] = [
  { code: 'RUB', name: 'российский рубль', bynRate: 0, value: undefined, removable: false },
  { code: 'BYN', name: 'белорусский рубль', bynRate: 1, value: DEFAULT_AMOUNT, removable: false },
  { code: 'CNY', name: 'китайский юань', bynRate: 0, value: undefined, removable: false },
  { code: 'TRY', name: 'турецкая лира', bynRate: 0, value: undefined, removable: false },
  { code: 'USD', name: 'доллар США', bynRate: 0, value: undefined, removable: false },
  { code: 'EUR', name: 'евро', bynRate: 0, value: undefined, removable: false }
]

const currencies = ref<CurrencyRow[]>(DEFAULT_CURRENCIES.map(c => ({ ...c })))
const ratesDate = ref('')
const loading = ref(true)
const refreshing = ref(false)
const fetchError = ref('')
const activeCurrency = ref('BYN')
const copyState = ref<'idle' | 'ok' | 'err'>('idle')
const copyStateRub = ref<'idle' | 'ok' | 'err'>('idle')

const bynFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true
})

/** Per-currency Intl.NumberFormatOptions — cached to avoid new objects on every render. */
const currencyFormatOptions = computed<Record<string, Intl.NumberFormatOptions>>(() =>
  Object.fromEntries(
    currencies.value
      .filter(c => /^[A-Z]{3}$/.test(c.code))
      .map(c => [c.code, {
        style: 'currency' as const,
        currency: c.code,
        currencyDisplay: 'code' as const,
        currencySign: 'accounting' as const
      }])
  )
)

const activeBynAmount = computed(() => {
  const byn = currencies.value.find(c => c.code === 'BYN')
  if (!byn || typeof byn.value !== 'number') return 0
  return byn.value
})

const amountInWords = computed(() => bynAmountInWords(activeBynAmount.value))

/**
 * RUB amount in words. Uses the same ruble/kopeck word forms as BYN —
 * both share "рубль / копейка" denominations.
 */
const amountInWordsRub = computed(() => {
  const rub = currencies.value.find(c => c.code === 'RUB')
  if (!rub || typeof rub.value !== 'number') return ''
  return bynAmountInWords(rub.value)
})

const formulaResult = computed(() => {
  return Math.round(activeBynAmount.value * FORMULA_FACTOR * 100) / 100
})

const formattedFormulaY = computed(() => bynFormatter.format(formulaResult.value))

/** Recalculates all currency values based on `amount` units of `code`. */
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
    if (byn) byn.value = byn.value ?? DEFAULT_AMOUNT
    recalcFrom('BYN', byn?.value ?? DEFAULT_AMOUNT)
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
    fetchError.value = 'Не удалось загрузить курсы НБ РБ. Попробуйте обновить страницу.'
  }
}

async function refresh() {
  if (loading.value || refreshing.value) return
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
  fetchError.value = ''
  const cached = loadFromCache()
  if (cached) {
    applyRates(cached.rates, cached.date)
    loading.value = false
    return
  }
  await fetchRates()
  loading.value = false
})

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

function onRowClick(code: string) {
  activeCurrency.value = code
}

let copyResetTimer: ReturnType<typeof setTimeout> | null = null
let copyResetTimerRub: ReturnType<typeof setTimeout> | null = null

function flashCopyState(state: 'ok' | 'err') {
  copyState.value = state
  if (copyResetTimer) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, COPY_FEEDBACK_MS)
}

function flashCopyStateRub(state: 'ok' | 'err') {
  copyStateRub.value = state
  if (copyResetTimerRub) clearTimeout(copyResetTimerRub)
  copyResetTimerRub = setTimeout(() => {
    copyStateRub.value = 'idle'
  }, COPY_FEEDBACK_MS)
}

async function copyWords() {
  const text = amountInWords.value
  if (!text) return
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    flashCopyState('err')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    flashCopyState('ok')
  } catch {
    // insecure context, permission denied, etc. — surface it instead of swallowing.
    flashCopyState('err')
  }
}

async function copyWordsRub() {
  const text = amountInWordsRub.value
  if (!text) return
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    flashCopyStateRub('err')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    flashCopyStateRub('ok')
  } catch {
    flashCopyStateRub('err')
  }
}

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer)
  if (copyResetTimerRub) clearTimeout(copyResetTimerRub)
})
</script>

<template>
  <div class="flex justify-center px-3 py-3 sm:py-6">
    <div class="w-full max-w-sm">
      <div class="mb-3 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 sm:text-sm">
        <a
          href="https://www.nbrb.by/"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline"
        >По курсу НБ РБ</a>
        <span
          v-if="ratesDate"
          class="text-gray-500 dark:text-gray-400"
        > · на {{ ratesDate }}</span>
        <B24Button
          aria-label="Обновить курсы"
          color="air-tertiary-no-accent"
          size="sm"
          :icon="RefreshIcon"
          :disabled="loading"
          :class="['ml-auto', refreshing ? '[&_svg]:animate-spin' : '']"
          @click="refresh"
        />
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="flex flex-col gap-2"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="h-14 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
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
        class="flex flex-col gap-2"
      >
        <div
          v-for="currency in currencies"
          :key="currency.code"
          class="flex items-center gap-3 rounded px-1 py-0.5 transition-colors"
          :class="currency.code === activeCurrency ? 'bg-gray-100 dark:bg-gray-900' : ''"
          @click="onRowClick(currency.code)"
        >
          <div class="flex w-[6.25rem] shrink-0 flex-col leading-tight">
            <span class="text-base font-semibold text-gray-700 dark:text-gray-200">
              {{ currency.code }}
            </span>
            <span class="truncate text-[10px] text-gray-400 dark:text-gray-500">
              {{ currency.name }}
            </span>
          </div>
          <B24InputNumber
            :model-value="currency.value"
            :model-modifiers="{ optional: true }"
            :step="stepFor(currency.value)"
            :min="0"
            :max="MAX_AMOUNT"
            :highlight="currency.code === activeCurrency"
            :format-options="currencyFormatOptions[currency.code]"
            size="xl"
            class="min-w-0 flex-1"
            :b24ui="{ base: 'text-right text-lg' }"
            @update:model-value="onValueUpdate(currency.code, $event)"
            @focus="activeCurrency = currency.code"
          />
        </div>

        <!-- Sum in words + copy -->
        <div class="mt-3 rounded border border-gray-200 p-3 dark:border-gray-700">
          <div class="mb-2 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Сумма прописью
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span class="w-8 shrink-0 pt-0.5 text-[10px] text-gray-400 dark:text-gray-500">BYN</span>
              <div class="flex-1 text-sm leading-snug text-gray-900 dark:text-gray-100">
                {{ amountInWords }}
              </div>
              <B24Button
                type="button"
                :aria-label="copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью'"
                :color="copyState === 'ok' ? 'air-primary-success' : copyState === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0"
                @click="copyWords"
              />
            </div>
            <div class="flex items-start gap-2">
              <span class="w-8 shrink-0 pt-0.5 text-[10px] text-gray-400 dark:text-gray-500">RUB</span>
              <div class="flex-1 text-sm leading-snug text-gray-900 dark:text-gray-100">
                {{ amountInWordsRub }}
              </div>
              <B24Button
                type="button"
                :aria-label="copyStateRub === 'ok' ? 'Скопировано' : copyStateRub === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью RUB'"
                :color="copyStateRub === 'ok' ? 'air-primary-success' : copyStateRub === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0"
                @click="copyWordsRub"
              />
            </div>
          </div>
        </div>

        <!-- Calculation formula -->
        <div class="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
          <div class="font-mono text-gray-700 dark:text-gray-200">
            (BYN − 20%) × 20% = <span class="font-semibold text-gray-900 dark:text-white">{{ formattedFormulaY }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
