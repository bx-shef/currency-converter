<script setup lang="ts">
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import InfoCircleIcon from '@bitrix24/b24icons-vue/outline/InfoCircleIcon'
import PlusIcon from '@bitrix24/b24icons-vue/actions/Plus30Icon'
import MinusIcon from '@bitrix24/b24icons-vue/actions/Minus30Icon'
import { rublesAmountInWords } from '~/utils/numberToWords'
import { applyFormula, capitalizeFirst, formatAmount, numberFormatOptions } from '~/utils/formatters'
import { vHoldRepeat } from '~/directives/holdRepeat'
import { MAX_AMOUNT } from '~/config/currencies'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { useCopyFeedback, useKeyedCopyFeedback } from '~/composables/useCopyFeedback'

// Rate loading, caching and row state live in the composable (issue #48).
const {
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
} = useNbrbRates()

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

// Optional capitalisation of the first letter (off by default) — handy when the
// "sum in words" is pasted into a payment order that expects a capital line.
const wordsCapitalized = ref(false)
const displayAmountInWords = computed(() =>
  wordsCapitalized.value ? capitalizeFirst(amountInWords.value) : amountInWords.value)
const displayAmountInWordsRub = computed(() =>
  wordsCapitalized.value ? capitalizeFirst(amountInWordsRub.value) : amountInWordsRub.value)

const formulaResult = computed(() => applyFormula(activeBynAmount.value))
const formattedFormulaY = computed(() => formatAmount(formulaResult.value))

// Clipboard feedback: one flash per "sum in words" line, plus a keyed one for
// the per-row "copy amount" buttons.
const { state: copyState, copy: copyBynWords } = useCopyFeedback()
const { state: copyStateRub, copy: copyRubWords } = useCopyFeedback()
const { copy: copyRowAmount, colorFor: rowCopyColorFor } = useKeyedCopyFeedback()

/** Copies one row's amount, stripping locale no-break spaces for clean pasting. */
function copyRow(code: string) {
  const c = currencies.value.find(r => r.code === code)
  if (!c || typeof c.value !== 'number') return
  // Strip the locale grouping no-break spaces (U+00A0 / U+202F) so the copied
  // number pastes cleanly into spreadsheets / payment forms.
  copyRowAmount(code, formatAmount(c.value).replace(/[\u00A0\u202F]/g, ' '))
}

/** Copy-button colour for a row: success/alert only while its flash is active. */
function rowCopyColor(code: string) {
  return rowCopyColorFor(code, 'air-primary-success', 'air-primary-alert', 'air-tertiary-no-accent')
}
</script>

<template>
  <div class="flex justify-center px-3 py-3 sm:px-4 sm:py-6">
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
          :disabled="loading || refreshing"
          :class="['ml-auto me-1.5', refreshing ? '[&_svg]:animate-spin' : '']"
          @click="refresh"
        />
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading"
        class="flex flex-col gap-2"
      >
        <div
          v-for="i in 7"
          :key="i"
          class="-mx-2 h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <!-- Error state -->
      <div
        v-else-if="fetchError"
        class="-mx-2 rounded-lg border border-red-200 px-2 py-3 text-sm text-red-500 dark:border-red-800"
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
          class="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 transition-[background-color,box-shadow] duration-150 sm:gap-3"
          :class="currency.code === activeCurrency
            ? 'bg-cyan-400/[0.06] ring-cyan-400/40 dark:bg-cyan-400/[0.07]'
            : 'ring-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03]'"
          @click="onRowClick(currency.code)"
        >
          <div class="flex w-16 shrink-0 flex-col leading-tight sm:w-[6.25rem]">
            <span class="text-base font-semibold tracking-wide text-gray-700 dark:text-gray-100">
              {{ currency.code }}
            </span>
            <!-- Full name fits the wider desktop column; on mobile it's behind a help tooltip. -->
            <span class="hidden truncate text-[10px] text-gray-400 sm:block dark:text-gray-500">
              {{ currency.name }}
            </span>
            <!-- @click.stop on the trigger keeps opening the tooltip from activating the row. -->
            <B24Tooltip
              :text="currency.name"
              class="sm:hidden"
            >
              <B24Button
                :icon="InfoCircleIcon"
                color="air-tertiary-no-accent"
                size="xs"
                class="-ms-1 w-fit text-gray-400"
                :aria-label="`Полное название: ${currency.name}`"
                @click.stop
              />
            </B24Tooltip>
          </div>
          <B24Button
            :icon="CopyIcon"
            :color="rowCopyColor(currency.code)"
            size="sm"
            class="shrink-0"
            :disabled="typeof currency.value !== 'number'"
            :aria-label="`Скопировать сумму ${currency.code}`"
            @click.stop="copyRow(currency.code)"
          />
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
            size="lg"
            class="min-w-0 flex-1"
            :b24ui="{ base: 'text-right text-base font-medium tabular-nums sm:text-lg' }"
            @update:model-value="onValueUpdate(currency.code, $event)"
            @focus="onRowClick(currency.code)"
          />
          <div class="flex shrink-0 gap-1">
            <B24Button
              v-hold-repeat="() => decrementCurrency(currency.code)"
              :icon="MinusIcon"
              color="air-tertiary-no-accent"
              size="lg"
              :aria-label="`Уменьшить ${currency.code}`"
              :disabled="typeof currency.value !== 'number' || currency.value <= 0"
              @click.stop="decrementCurrency(currency.code)"
            />
            <B24Button
              v-hold-repeat="() => incrementCurrency(currency.code)"
              :icon="PlusIcon"
              color="air-tertiary-no-accent"
              size="lg"
              :aria-label="`Увеличить ${currency.code}`"
              :disabled="typeof currency.value === 'number' && currency.value >= MAX_AMOUNT"
              @click.stop="incrementCurrency(currency.code)"
            />
          </div>
        </div>

        <!-- Sum in words + copy -->
        <div class="-mx-2 mt-3 rounded-xl border border-gray-200 bg-gray-50/60 px-2 py-3 dark:border-white/10 dark:bg-white/[0.02]">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Сумма прописью
            </span>
            <div
              class="flex shrink-0 overflow-hidden rounded-md border border-gray-200 dark:border-white/10"
              role="group"
              aria-label="Регистр первой буквы"
            >
              <button
                type="button"
                class="px-1.5 py-0.5 text-[11px] leading-none transition-colors"
                :class="!wordsCapitalized ? 'bg-gray-200 font-semibold text-gray-900 dark:bg-white/15 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'"
                :aria-pressed="!wordsCapitalized"
                aria-label="Строчная первая буква"
                @click="wordsCapitalized = false"
              >
                аб
              </button>
              <button
                type="button"
                class="border-l border-gray-200 px-1.5 py-0.5 text-[11px] leading-none transition-colors dark:border-white/10"
                :class="wordsCapitalized ? 'bg-gray-200 font-semibold text-gray-900 dark:bg-white/15 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'"
                :aria-pressed="wordsCapitalized"
                aria-label="Заглавная первая буква"
                @click="wordsCapitalized = true"
              >
                Аб
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-start gap-2">
              <span class="w-6 shrink-0 pt-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">BYN</span>
              <div class="flex-1 text-sm leading-snug text-gray-900 dark:text-gray-100">
                {{ displayAmountInWords }}
              </div>
              <B24Button
                type="button"
                :aria-label="copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью'"
                :color="copyState === 'ok' ? 'air-primary-success' : copyState === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0 me-1.5"
                @click="copyBynWords(displayAmountInWords)"
              />
            </div>
            <div class="flex items-start gap-2">
              <span class="w-6 shrink-0 pt-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">RUB</span>
              <div class="flex-1 text-sm leading-snug text-gray-900 dark:text-gray-100">
                {{ displayAmountInWordsRub }}
              </div>
              <B24Button
                type="button"
                :aria-label="copyStateRub === 'ok' ? 'Скопировано' : copyStateRub === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью RUB'"
                :color="copyStateRub === 'ok' ? 'air-primary-success' : copyStateRub === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0 me-1.5"
                @click="copyRubWords(displayAmountInWordsRub)"
              />
            </div>
          </div>
        </div>

        <!-- Calculation formula -->
        <div class="-mx-2 rounded-xl border border-gray-200 bg-gray-50/60 px-2 py-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
          <div class="font-mono text-gray-700 tabular-nums dark:text-gray-200">
            (BYN − 20%) × 20% = <span class="font-semibold text-gray-900 dark:text-white">{{ formattedFormulaY }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
