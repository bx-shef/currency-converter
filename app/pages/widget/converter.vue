<script setup lang="ts">
import { Text } from '@bitrix24/b24jssdk'
import { computed, onMounted, ref } from 'vue'
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import SendIcon from '@bitrix24/b24icons-vue/outline/SendIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import PlusIcon from '@bitrix24/b24icons-vue/actions/Plus30Icon'
import MinusIcon from '@bitrix24/b24icons-vue/actions/Minus30Icon'
import { useB24 } from '~/composables/useB24'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { useCopyFeedback, useKeyedCopyFeedback } from '~/composables/useCopyFeedback'
import { rublesAmountInWords } from '~/utils/numberToWords'
import { capitalizeFirst, formatPlainAmount, numberFormatOptions } from '~/utils/formatters'
import { buildWordsLines } from '~/utils/chatMessage'
import { vHoldRepeat } from '~/directives/holdRepeat'
import { safeHttpUrl } from '~/utils/url'
import { MAX_AMOUNT } from '~/config/currencies'

definePageMeta({ layout: 'clear' })

const config = useRuntimeConfig()
const { t } = useI18n()
const toast = useToast()
const b24Instance = useB24()
const isReady = computed(() => b24Instance.isInit())

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

useHead({ title: t('page.widget.seo.title') })

const isBusy = ref(false)

// b24ui detects the host from the User-Agent (`BitrixMobile/Version=…`). In the
// mobile app the widget is full-screen, so use larger, touch-friendly controls
// and drop the clipboard/insert actions (the mobile WebView has no Clipboard API
// and chat insert is disabled for now); in the desktop chat panel (IM_TEXTAREA,
// ~360px) stay compact.
const { isBitrixMobile } = useDevice()
const ctrlSize = computed(() => (isBitrixMobile.value ? 'md' : 'xs'))
// Shared class strings for the BYN/RUB sum-in-words rows, so the two can't drift.
const wordsLabelClass = computed(() => (isBitrixMobile.value ? 'w-12 text-xs' : 'w-9 text-[10px]'))
const wordsTextClass = computed(() => (isBitrixMobile.value ? 'text-sm' : 'text-[11px]'))

// authorName is operator-controlled (env); trim + clamp so a malformed value
// can't blow out the footer. Rendered via {{ }} (auto-escaped — not XSS).
const authorName = ((config.public.authorName as string) || 'bx-shef').trim().slice(0, 40) || 'bx-shef'
const authorUrl = safeHttpUrl(config.public.authorUrl as string, 'https://bx-shef.by')

// Optional capitalisation of the first letter (off by default) — mirrors the
// аб/Аб toggle on the main page; affects both the on-screen preview and the
// text inserted into the chat.
const wordsCapitalized = ref(false)

/** Lowercase «прописью» for a ruble row, or '' when it has no numeric value. */
function rawWords(code: 'BYN' | 'RUB'): string {
  const row = currencies.value.find(c => c.code === code)
  return row && typeof row.value === 'number' ? rublesAmountInWords(row.value) : ''
}
const displayBynWords = computed(() =>
  wordsCapitalized.value ? capitalizeFirst(rawWords('BYN')) : rawWords('BYN'))
const displayRubWords = computed(() =>
  wordsCapitalized.value ? capitalizeFirst(rawWords('RUB')) : rawWords('RUB'))

// Clipboard feedback: per-row amount + per-currency sum-in-words.
const { copy: copyRowAmount, colorFor: rowCopyColorFor } = useKeyedCopyFeedback()
const { state: copyStateByn, copy: copyBynWords } = useCopyFeedback()
const { state: copyStateRub, copy: copyRubWords } = useCopyFeedback()

/** Copies one row's amount as a plain number (dot, 2 decimals, no grouping). */
function copyRow(code: string) {
  const c = currencies.value.find(r => r.code === code)
  if (!c || typeof c.value !== 'number') return
  copyRowAmount(code, formatPlainAmount(c.value))
}
function rowCopyColor(code: string) {
  return rowCopyColorFor(code, 'air-primary-success', 'air-primary-alert', 'air-tertiary-no-accent')
}

onMounted(async () => {
  await b24Instance.init()
})

/** The «прописью» text inserted into the chat: BYN + RUB lines, honouring the
 *  аб/Аб toggle. Empty when no ruble row has a value. */
function buildMessage(): string {
  return buildWordsLines(currencies.value, t('page.widget.inWords'), wordsCapitalized.value).join('\n')
}

/** Inserts the sum-in-words into the chat input via the documented messenger
 *  method `im:setImTextareaContent` (IM_TEXTAREA placement). */
async function insertIntoChat() {
  if (!isReady.value) {
    toast.add({ title: t('page.widget.notInFrame'), color: 'air-primary-warning' })
    return
  }
  const text = buildMessage()
  if (!text) return

  isBusy.value = true
  try {
    const $b24 = b24Instance.getOrThrow()
    const requestId = Text.getUuidRfc4122()
    await $b24.parent.message.send('im:setImTextareaContent', {
      text,
      requestId,
      withNewLine: false,
      replace: true,
      isSafely: true,
      safelyTime: 1500
    })
    toast.add({ title: t('page.widget.inserted'), color: 'air-primary-success', duration: 1500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[widget] im:setImTextareaContent failed', e)
    toast.add({ title: t('page.widget.insertFailed'), description: msg, color: 'air-primary-alert' })
  } finally {
    isBusy.value = false
  }
}
</script>

<template>
  <!-- Natural top-down flow (no flex-1 push), so content isn't stranded with a
       big gap above a bottom-pinned button on tall mobile screens.
       w-full (not w-screen): 100vw includes the vertical scrollbar width, so on a
       tall popup it forced a few-px horizontal scrollbar that shifted the layout
       right during copy-selection (issue #135). 100% of the frame fixes it. -->
  <div class="min-h-screen w-full bg-(--ui-color-base-bg) flex flex-col gap-2 p-3">
    <!-- Top bar: rate date + refresh. The widget title lives on the chat chip
         (placement TITLE), so we don't repeat it here — saves a line. -->
    <div class="flex items-center justify-between gap-2">
      <p
        class="text-(--ui-color-base-3) truncate min-w-0"
        :class="isBitrixMobile ? 'text-sm' : 'text-[11px]'"
      >
        {{ t('app.subtitle') }}<span v-if="ratesDate"> · {{ t('app.ratesOn', { date: ratesDate }) }}</span>
      </p>
      <B24Button
        :aria-label="t('app.refresh')"
        color="air-tertiary-no-accent"
        :size="ctrlSize"
        :icon="RefreshIcon"
        :loading="refreshing"
        :disabled="loading"
        @click="refresh"
      />
    </div>

    <!-- Soft refresh error (issue #156): a failed manual refresh keeps the stale
         rows visible and shows this dismissible banner instead of blanking them. -->
    <B24Alert
      v-if="refreshError"
      color="air-primary-warning"
      size="sm"
      :close="true"
      :title="t('app.refreshError.title')"
      :description="t('app.refreshError.description')"
      @update:open="dismissRefreshError"
    />

    <!-- Currency rows: code + (copy) + input + −/+ — same grouping as the main page. -->
    <div class="flex flex-col gap-1">
      <div
        v-if="loading"
        class="space-y-1"
      >
        <div
          v-for="i in currencies.length"
          :key="i"
          class="animate-pulse rounded bg-(--ui-color-base-2)"
          :class="isBitrixMobile ? 'h-11' : 'h-8'"
        />
      </div>
      <div
        v-else-if="fetchError"
        class="text-xs text-(--ui-color-accent-main-alert) p-2"
      >
        {{ t('app.fetchError') }}
      </div>
      <div
        v-for="currency in currencies"
        v-else
        :key="currency.code"
        class="flex items-center gap-1.5"
        @click="onRowClick(currency.code)"
      >
        <span
          class="shrink-0 font-semibold text-(--ui-color-base-1)"
          :class="isBitrixMobile ? 'w-12 text-base' : 'w-9 text-xs'"
        >
          {{ currency.code }}
        </span>
        <!-- Clipboard copy: hidden in the mobile app (no Clipboard API there). -->
        <B24Button
          v-if="!isBitrixMobile"
          :icon="CopyIcon"
          :color="rowCopyColor(currency.code)"
          :size="ctrlSize"
          class="shrink-0"
          :disabled="typeof currency.value !== 'number'"
          :aria-label="`${t('page.widget.copyAmount')} ${currency.code}`"
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
          :size="ctrlSize"
          class="min-w-0 flex-1"
          :b24ui="{ base: 'text-right tabular-nums' }"
          @update:model-value="onValueUpdate(currency.code, $event)"
          @focus="onRowClick(currency.code)"
        />
        <B24Button
          v-hold-repeat="() => decrementCurrency(currency.code)"
          :icon="MinusIcon"
          color="air-tertiary-no-accent"
          :size="ctrlSize"
          class="shrink-0"
          :aria-label="`${t('page.widget.decrease')} ${currency.code}`"
          :disabled="typeof currency.value !== 'number' || currency.value <= 0"
          @click.stop="decrementCurrency(currency.code)"
        />
        <B24Button
          v-hold-repeat="() => incrementCurrency(currency.code)"
          :icon="PlusIcon"
          color="air-tertiary-no-accent"
          :size="ctrlSize"
          class="shrink-0"
          :aria-label="`${t('page.widget.increase')} ${currency.code}`"
          :disabled="typeof currency.value === 'number' && currency.value >= MAX_AMOUNT"
          @click.stop="incrementCurrency(currency.code)"
        />
      </div>
    </div>

    <!-- Sum-in-words (BYN + RUB) + case toggle, then the insert button. -->
    <div class="flex flex-col gap-2 border-t border-(--ui-color-base-2) pt-2">
      <div class="flex items-center justify-between gap-2">
        <span
          class="uppercase tracking-wide text-(--ui-color-base-3)"
          :class="isBitrixMobile ? 'text-xs' : 'text-[10px]'"
        >
          {{ t('page.widget.sumInWords') }}
        </span>
        <div
          class="flex shrink-0 overflow-hidden rounded-md border border-(--ui-color-base-2)"
          role="group"
          :aria-label="t('page.widget.caseGroup')"
        >
          <button
            type="button"
            class="leading-none transition-colors"
            :class="[isBitrixMobile ? 'px-3 py-2 text-sm' : 'px-1.5 py-0.5 text-[11px]', !wordsCapitalized ? 'bg-(--ui-color-base-2) font-semibold text-(--ui-color-base-1)' : 'text-(--ui-color-base-3)']"
            :aria-pressed="!wordsCapitalized"
            :aria-label="t('page.widget.caseLower')"
            @click="wordsCapitalized = false"
          >
            аб
          </button>
          <button
            type="button"
            class="border-l border-(--ui-color-base-2) leading-none transition-colors"
            :class="[isBitrixMobile ? 'px-3 py-2 text-sm' : 'px-1.5 py-0.5 text-[11px]', wordsCapitalized ? 'bg-(--ui-color-base-2) font-semibold text-(--ui-color-base-1)' : 'text-(--ui-color-base-3)']"
            :aria-pressed="wordsCapitalized"
            :aria-label="t('page.widget.caseUpper')"
            @click="wordsCapitalized = true"
          >
            Аб
          </button>
        </div>
      </div>

      <div
        v-if="displayBynWords"
        class="flex items-start gap-1.5"
      >
        <span
          class="shrink-0 pt-0.5 font-medium text-(--ui-color-base-3)"
          :class="wordsLabelClass"
        >BYN</span>
        <span
          class="flex-1 leading-snug text-(--ui-color-base-1)"
          :class="wordsTextClass"
        >{{ displayBynWords }}</span>
        <B24Button
          v-if="!isBitrixMobile"
          :icon="CopyIcon"
          :size="ctrlSize"
          class="shrink-0"
          :aria-label="t('page.widget.copyWords')"
          :color="copyStateByn === 'ok' ? 'air-primary-success' : copyStateByn === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
          @click="copyBynWords(displayBynWords)"
        />
      </div>
      <div
        v-if="displayRubWords"
        class="flex items-start gap-1.5"
      >
        <span
          class="shrink-0 pt-0.5 font-medium text-(--ui-color-base-3)"
          :class="wordsLabelClass"
        >RUB</span>
        <span
          class="flex-1 leading-snug text-(--ui-color-base-1)"
          :class="wordsTextClass"
        >{{ displayRubWords }}</span>
        <B24Button
          v-if="!isBitrixMobile"
          :icon="CopyIcon"
          :size="ctrlSize"
          class="shrink-0"
          :aria-label="t('page.widget.copyWords')"
          :color="copyStateRub === 'ok' ? 'air-primary-success' : copyStateRub === 'err' ? 'air-primary-alert' : 'air-tertiary-no-accent'"
          @click="copyRubWords(displayRubWords)"
        />
      </div>

      <!-- Insert into chat: hidden in the mobile app for now (per portal feedback). -->
      <B24Button
        v-if="!isBitrixMobile"
        block
        size="sm"
        color="air-primary"
        :icon="SendIcon"
        :label="t('page.widget.insert')"
        :disabled="isBusy || !isReady || loading || !!fetchError"
        @click="insertIntoChat"
      />

      <!-- Footer: author only (site link removed per portal feedback). -->
      <div
        class="flex items-center justify-end text-(--ui-color-base-3) px-1"
        :class="isBitrixMobile ? 'text-xs' : 'text-[10px]'"
      >
        <span class="shrink-0">
          {{ t('footer.by') }}
          <a
            :href="authorUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:underline"
          >{{ authorName }}</a>
        </span>
      </div>
    </div>
  </div>
</template>
