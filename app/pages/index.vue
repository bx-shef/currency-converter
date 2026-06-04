<script setup lang="ts">
import type { Ref } from 'vue'
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import PlusIcon from '@bitrix24/b24icons-vue/actions/Plus30Icon'
import MinusIcon from '@bitrix24/b24icons-vue/actions/Minus30Icon'
import { applyStep, recalcFrom } from '~/utils/converter'
import { rublesAmountInWords } from '~/utils/numberToWords'
import { applyFormula, formatAmount, numberFormatOptions } from '~/utils/formatters'
import { vHoldRepeat } from '~/directives/holdRepeat'

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

const DEFAULT_CURRENCIES: CurrencyRow[] = [
  { code: 'RUB', name: 'российский рубль', bynRate: 0, value: undefined },
  { code: 'BYN', name: 'белорусский рубль', bynRate: 1, value: DEFAULT_AMOUNT },
  { code: 'CNY', name: 'китайский юань', bynRate: 0, value: undefined },
  { code: 'TRY', name: 'турецкая лира', bynRate: 0, value: undefined },
  { code: 'USD', name: 'доллар США', bynRate: 0, value: undefined },
  { code: 'EUR', name: 'евро', bynRate: 0, value: undefined }
]

const currencies = ref<CurrencyRow[]>(DEFAULT_CURRENCIES.map(c => ({ ...c })))
const ratesDate = ref('')
const loading = ref(true)
const refreshing = ref(false)
const fetchError = ref('')
const activeCurrency = ref('BYN')

type CopyState = 'idle' | 'ok' | 'err'
const copyState = ref<CopyState>('idle')
const copyStateRub = ref<CopyState>('idle')

const activeBynAmount = computed(() => {
  const byn = currencies.value.find(c => c.code === 'BYN')
  if (!byn || typeof byn.value !== 'number') return 0
  return byn.value
})

const amountInWords = computed(() => rublesAmountInWords(activeBynAmount.value))

/** RUB amount in words — same ruble/kopeck word forms as BYN. */
const amountInWordsRub = computed(() => {
  const rub = currencies.value.find(c => c.code === 'RUB')
  if (!rub || typeof rub.value !== 'number') return ''
  return rublesAmountInWords(rub.value)
})

const formulaResult = computed(() => applyFormula(activeBynAmount.value))

const formattedFormulaY = computed(() => formatAmount(formulaResult.value))

/**
 * Applies fetched BYN-rates to the rows and recomputes values. Keeps the active
 * currency as the conversion source when its rate is available; otherwise falls
 * back to BYN with the default amount (e.g. when rates load before any input).
 */
function applyRates(rateMap: Array<{ code: string, bynRate: number }>, date: string) {
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

/** Reads cached rates from sessionStorage; null when missing, stale, or unparsable. */
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

/** Persists rates to sessionStorage; silently no-ops when storage is unavailable. */
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

/**
 * Handles input on a currency field: normalizes null/NaN to `undefined`, makes
 * the row active, and recomputes the other rows from it (a cleared field leaves
 * the rest untouched).
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

/**
 * Builds a clipboard-copy action bound to one feedback-state ref. Writes the
 * text and flashes `ok`/`err` on `state` for COPY_FEEDBACK_MS. `dispose` clears
 * the pending reset timer on unmount.
 */
function createCopier(state: Ref<CopyState>) {
  let timer: ReturnType<typeof setTimeout> | null = null
  function flash(next: 'ok' | 'err') {
    state.value = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      state.value = 'idle'
    }, COPY_FEEDBACK_MS)
  }
  async function copy(text: string) {
    if (!text) return
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      // insecure context / unsupported — surface it instead of swallowing.
      flash('err')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      flash('ok')
    } catch {
      flash('err')
    }
  }
  function dispose() {
    if (timer) clearTimeout(timer)
  }
  return { copy, dispose }
}

const bynCopier = createCopier(copyState)
const rubCopier = createCopier(copyStateRub)

onBeforeUnmount(() => {
  bynCopier.dispose()
  rubCopier.dispose()
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
          class="flex items-center gap-3 rounded-lg px-2 py-1.5 ring-1 transition-[background-color,box-shadow] duration-150"
          :class="currency.code === activeCurrency
            ? 'bg-cyan-400/[0.06] ring-cyan-400/40 dark:bg-cyan-400/[0.07]'
            : 'ring-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03]'"
          @click="onRowClick(currency.code)"
        >
          <div class="flex w-[6.25rem] shrink-0 flex-col leading-tight">
            <span class="text-base font-semibold tracking-wide text-gray-700 dark:text-gray-100">
              {{ currency.code }}
            </span>
            <span class="truncate text-[10px] text-gray-400 dark:text-gray-500">
              {{ currency.name }}
            </span>
          </div>
          <B24InputNumber
            :model-value="currency.value"
            :model-modifiers="{ optional: true }"
            :step="0.01"
            :min="0"
            :max="MAX_AMOUNT"
            :increment="false"
            :decrement="false"
            :highlight="currency.code === activeCurrency"
            :format-options="numberFormatOptions"
            :aria-label="`Сумма в ${currency.code} (${currency.name})`"
            size="xl"
            class="min-w-0 flex-1"
            :b24ui="{ base: 'text-right text-lg font-medium tabular-nums' }"
            @update:model-value="onValueUpdate(currency.code, $event)"
            @focus="activeCurrency = currency.code"
          />
          <div class="flex shrink-0 gap-1">
            <B24Button
              v-hold-repeat="() => decrementCurrency(currency.code)"
              :icon="MinusIcon"
              color="air-tertiary-no-accent"
              size="xl"
              :aria-label="`Уменьшить ${currency.code}`"
              :disabled="typeof currency.value !== 'number' || currency.value <= 0"
              @click.stop="decrementCurrency(currency.code)"
            />
            <B24Button
              v-hold-repeat="() => incrementCurrency(currency.code)"
              :icon="PlusIcon"
              color="air-tertiary-no-accent"
              size="xl"
              :aria-label="`Увеличить ${currency.code}`"
              :disabled="typeof currency.value === 'number' && currency.value >= MAX_AMOUNT"
              @click.stop="incrementCurrency(currency.code)"
            />
          </div>
        </div>

        <!-- Sum in words + copy -->
        <div class="mt-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02]">
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
                @click="bynCopier.copy(amountInWords)"
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
                @click="rubCopier.copy(amountInWordsRub)"
              />
            </div>
          </div>
        </div>

        <!-- Calculation formula -->
        <div class="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
          <div class="font-mono text-gray-700 tabular-nums dark:text-gray-200">
            (BYN − 20%) × 20% = <span class="font-semibold text-gray-900 dark:text-white">{{ formattedFormulaY }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
