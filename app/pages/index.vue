<script setup lang="ts">
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import PlusIcon from '@bitrix24/b24icons-vue/actions/Plus30Icon'
import MinusIcon from '@bitrix24/b24icons-vue/actions/Minus30Icon'
import LikeIcon from '@bitrix24/b24icons-vue/outline/LikeIcon'
import DislikeIcon from '@bitrix24/b24icons-vue/outline/DislikeIcon'
import { rublesAmountInWords } from '~/utils/numberToWords'
import { applyFormula, capitalizeFirst, formatAmount, formatPlainAmount, numberFormatOptions, quarterLabel } from '~/utils/formatters'
import { vHoldRepeat } from '~/directives/holdRepeat'
import { MAX_AMOUNT } from '~/config/currencies'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { useCopyFeedback, useKeyedCopyFeedback } from '~/composables/useCopyFeedback'
import { useB24 } from '~/composables/useB24'
import { useMetrikaGoal } from '~/composables/useMetrikaGoal'

const { t } = useI18n()
const b24Instance = useB24()
const isB24 = computed(() => b24Instance.isInit())
// In the Bitrix24 mobile app the clipboard API is unavailable — hide the copy
// buttons there (b24ui detects the host from the `BitrixMobile/…` User-Agent).
const { isBitrixMobile } = useDevice()

// Rate loading, caching and row state live in the composable (issue #48).
const {
  currencies,
  ratesDate,
  loading,
  refreshing,
  fetchError,
  refreshError,
  dismissRefreshError,
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

// "Was the rate helpful?" — a one-time 👍/👎 nudge shown standalone only (Metrika
// is suppressed inside the B24 portal, so the goal would no-op there). The answer
// is remembered in localStorage so a returning visitor isn't asked again.
// 'idle' = ask · 'thanks' = just answered this visit · 'hidden' = answered before.
const HELPFUL_KEY = 'converter_helpful_v1'
const helpful = ref<'idle' | 'thanks' | 'hidden'>('idle')
onMounted(() => {
  try {
    if (localStorage.getItem(HELPFUL_KEY) === '1') helpful.value = 'hidden'
  } catch { /* localStorage blocked (private mode) — just show the prompt */ }
})
const { reachGoal: reachHelpfulGoal } = useMetrikaGoal()
function rateHelpful(yes: boolean) {
  // Ignore a second click landing before the re-render removes the buttons —
  // otherwise a quick double-tap could send both goals in one visit.
  if (helpful.value !== 'idle') return
  reachHelpfulGoal(yes ? 'converter_helpful_yes' : 'converter_helpful_no')
  try {
    localStorage.setItem(HELPFUL_KEY, '1')
  } catch { /* ignore — feedback is best-effort */ }
  helpful.value = 'thanks'
}

const formulaResult = computed(() => applyFormula(activeBynAmount.value))
const formattedFormulaY = computed(() => formatAmount(formulaResult.value))
/** Plain (dot, 2 decimals, no grouping) formula result for the clipboard. */
const formulaPlain = computed(() => formatPlainAmount(formulaResult.value))

// Current calendar quarter shown under the formula (e.g. "II квартал 2026").
// Computed once at setup; the label lives inside the `v-else` branch that only
// renders after rates load on the client (the page prerenders the loading
// skeleton instead), so there is no SSG hydration mismatch.
const currentQuarter = quarterLabel()

// Clipboard feedback: one flash per "sum in words" line, plus a keyed one for
// the per-row "copy amount" buttons.
const { state: copyState, copy: copyBynWords } = useCopyFeedback()
const { state: copyStateRub, copy: copyRubWords } = useCopyFeedback()
const { state: copyStateFormula, copy: copyFormulaText } = useCopyFeedback()
const { copy: copyRowAmount, colorFor: rowCopyColorFor } = useKeyedCopyFeedback()

/** Copies one row's amount as a plain number (dot, 2 decimals, no grouping) —
 *  the same clean format as the formula copy, for pasting into spreadsheets. */
function copyRow(code: string) {
  const c = currencies.value.find(r => r.code === code)
  if (!c || typeof c.value !== 'number') return
  copyRowAmount(code, formatPlainAmount(c.value))
}

/** Copy-button colour for a row: success/alert only while its flash is active. */
function rowCopyColor(code: string) {
  return rowCopyColorFor(code, 'air-primary-success', 'air-primary-alert', 'air-tertiary-no-accent')
}

// Root content element — measured to fit the B24 iframe to its content.
const rootEl = ref<HTMLElement | null>(null)
// Kept at setup scope so onBeforeUnmount (registered synchronously below) can
// tear them down even though they're created inside the async onMounted.
let resizeObserver: ResizeObserver | null = null
let fitRaf = 0

// Dual-mode: `/` is also the B24 Application URL, so it can open inside the
// portal. init() establishes the B24Frame (idempotent; a no-op standalone —
// there's no window.name), which flips isB24 → hides the standalone-only nudge
// and enables the fit-to-content flow below. Without it, isB24 stays false even
// inside the portal and this whole block never ran.
//
// Inside a B24 frame: set the iframe title, then keep the frame sized to the
// app content so the portal provides a single outer scrollbar instead of a
// double scroll inside the app frame (fitWindow). Re-fit on content changes —
// rates loading, rows added/removed, the «прописью» block wrapping, theme.
onMounted(async () => {
  await b24Instance.init()
  const $b24 = b24Instance.get()
  if (!$b24) return
  try {
    await $b24.parent.setTitle(t('page.index.seo.title'))
  } catch {
    // setTitle is best-effort — failure inside the frame is non-fatal
    return
  }

  // fitWindow runs in the SDK's isSafely mode, so a transient failure is a no-op.
  const fit = () => {
    $b24.parent.fitWindow().catch(() => {})
  }
  fit()
  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    // Coalesce bursts of layout changes into one fit per frame.
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(fitRaf)
      fitRaf = requestAnimationFrame(fit)
    })
    resizeObserver.observe(rootEl.value)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(fitRaf)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="rootEl"
    class="flex flex-col items-center px-3 py-3 sm:px-4 sm:py-6"
  >
    <!-- Document heading for SEO/a11y (the page has no visible title — the tool
         itself is the hero). sr-only so it stays out of the flex layout. -->
    <h1 class="sr-only">
      Конвертер валют по официальному курсу НБ РБ
    </h1>
    <div class="w-full max-w-sm sm:max-w-[464px]">
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
          v-for="i in currencies.length"
          :key="i"
          class="-mx-2 h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <!-- Error state -->
      <div
        v-else-if="fetchError"
        class="-mx-2 rounded-lg border border-red-200 px-2 py-3 text-sm text-red-500 dark:border-red-800"
      >
        <!-- Intentionally a RU literal: this standalone page has no non-RU
             audience (all its visible text — labels and aria-labels below — is
             hardcoded RU; see #87). The multilingual B24 widget localizes the
             same message via t('app.fetchError'); index.nuxt.test.ts asserts this
             literal equals ru.json's app.fetchError so the two can't drift (#97). -->
        Не удалось загрузить курсы НБ РБ. Попробуйте обновить страницу.
      </div>

      <!-- Currency rows -->
      <div
        v-else
        class="flex flex-col gap-2"
      >
        <!-- Soft refresh error (issue #156): a failed manual refresh keeps the
             already-loaded rows on screen and shows this dismissible banner
             instead of blanking them. RU literals mirror ru.json's
             app.refreshError (this standalone page is RU-only, see #87/#97);
             index.nuxt.test.ts asserts they equal ru.json so they can't drift. -->
        <B24Alert
          v-if="refreshError"
          color="air-primary-warning"
          size="sm"
          :close="true"
          title="Не удалось обновить курсы"
          description="Показаны последние загруженные значения."
          class="-mx-2"
          @update:open="dismissRefreshError"
        />
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
            <!-- Full name is shown only where the column is wide enough (desktop). -->
            <span class="hidden truncate text-[10px] text-gray-400 sm:block dark:text-gray-500">
              {{ currency.name }}
            </span>
          </div>
          <B24Button
            v-if="!isBitrixMobile"
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
              class="flex shrink-0 me-[2px] overflow-hidden rounded-md border border-gray-200 dark:border-white/10"
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
                v-if="!isBitrixMobile"
                type="button"
                :aria-label="copyState === 'ok' ? 'Скопировано' : copyState === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью'"
                :color="copyState === 'ok' ? 'air-primary-success' : copyState === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0 me-[3px]"
                @click="copyBynWords(displayAmountInWords)"
              />
            </div>
            <div class="flex items-start gap-2">
              <span class="w-6 shrink-0 pt-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">RUB</span>
              <div class="flex-1 text-sm leading-snug text-gray-900 dark:text-gray-100">
                {{ displayAmountInWordsRub }}
              </div>
              <B24Button
                v-if="!isBitrixMobile"
                type="button"
                :aria-label="copyStateRub === 'ok' ? 'Скопировано' : copyStateRub === 'err' ? 'Не удалось скопировать' : 'Скопировать сумму прописью RUB'"
                :color="copyStateRub === 'ok' ? 'air-primary-success' : copyStateRub === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
                size="sm"
                :icon="CopyIcon"
                class="shrink-0 me-[3px]"
                @click="copyRubWords(displayAmountInWordsRub)"
              />
            </div>
          </div>
        </div>

        <!-- Calculation formula -->
        <div class="-mx-2 rounded-xl border border-gray-200 bg-gray-50/60 px-2 py-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
          <div class="flex items-center justify-between gap-2">
            <div class="font-mono text-gray-700 tabular-nums dark:text-gray-200">
              (BYN − 20%) × 20% = <span class="font-semibold text-gray-900 dark:text-white">{{ formattedFormulaY }}</span>
            </div>
            <B24Button
              v-if="!isBitrixMobile"
              type="button"
              :aria-label="copyStateFormula === 'ok' ? 'Скопировано' : copyStateFormula === 'err' ? 'Не удалось скопировать' : 'Скопировать результат формулы'"
              :color="copyStateFormula === 'ok' ? 'air-primary-success' : copyStateFormula === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
              size="sm"
              :icon="CopyIcon"
              class="shrink-0 me-[3px]"
              @click="copyFormulaText(formulaPlain)"
            />
          </div>
          <!-- Current quarter — small and muted, like the BYN/RUB labels above
               but one step larger (text-xs) for readability on mobile. -->
          <div class="mt-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
            {{ currentQuarter }}
          </div>
        </div>

        <!-- One-time "was it helpful?" nudge → Metrika goal. Standalone only:
             telemetry is suppressed inside the B24 portal (metrika.js), so the
             prompt is hidden there rather than shown with a no-op click. -->
        <div
          v-if="!isB24 && helpful !== 'hidden'"
          role="status"
          aria-live="polite"
          class="flex items-center justify-center gap-2 pt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          <template v-if="helpful === 'idle'">
            <span>Помог курс?</span>
            <B24Button
              size="sm"
              color="air-tertiary-no-accent"
              :icon="LikeIcon"
              aria-label="Да, курс помог"
              @click="rateHelpful(true)"
            />
            <B24Button
              size="sm"
              color="air-tertiary-no-accent"
              :icon="DislikeIcon"
              aria-label="Нет, курс не помог"
              @click="rateHelpful(false)"
            />
          </template>
          <span v-else>Спасибо за отзыв 🙌</span>
        </div>
      </div>
    </div>
    <ConverterPromo />
  </div>
</template>
