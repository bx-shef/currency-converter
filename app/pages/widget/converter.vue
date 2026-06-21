<script setup lang="ts">
import { Text } from '@bitrix24/b24jssdk'
import { computed, onMounted, ref } from 'vue'
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import SendIcon from '@bitrix24/b24icons-vue/outline/SendIcon'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import { useB24 } from '~/composables/useB24'
import { useNbrbRates } from '~/composables/useNbrbRates'
import { writeToClipboard } from '~/utils/copyFeedback'
import { rublesAmountInWords } from '~/utils/numberToWords'
import { capitalizeFirst, numberFormatOptions } from '~/utils/formatters'
import { buildConversionLines, wordsCurrencyCode } from '~/utils/chatMessage'
import { safeHttpUrl } from '~/utils/url'
import { IMMOBILE_CONTEXT_MENU_PLACEMENT } from '~/config/b24'
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
  activeCurrency,
  refresh,
  onValueUpdate,
  onRowClick
} = useNbrbRates()

useHead({ title: t('page.widget.seo.title') })

const isBusy = ref(false)

// Which placement opened this widget. IMMOBILE_CONTEXT_MENU (mobile message
// context menu) opens in a slider with no chat input beneath it, so
// `im:setImTextareaContent` can't reach a textarea there — offer "Copy" instead
// of "Insert into chat". Read after init() in onMounted (issue #89).
const placementCode = ref('')
const isMobileMenu = computed(() => placementCode.value === IMMOBILE_CONTEXT_MENU_PLACEMENT)

// authorName is operator-controlled (env); trim + clamp so a malformed value
// can't blow out the 320px footer. Rendered via {{ }} (auto-escaped — not XSS).
const authorName = ((config.public.authorName as string) || 'bx-shef').trim().slice(0, 40) || 'bx-shef'
const authorUrl = safeHttpUrl(config.public.authorUrl as string, 'https://bx-shef.by')
const siteUrl = safeHttpUrl(config.public.siteUrl as string, 'https://github.com/bx-shef/currency-converter')

// Sum-in-words preview shown under the insert button and appended to the chat
// message. Only ruble currencies have a meaningful "amount in words", so we show
// the active row when it is BYN/RUB, otherwise fall back to BYN (the base).
const wordsRow = computed(() => {
  const code = wordsCurrencyCode(activeCurrency.value)
  const row = currencies.value.find(c => c.code === code)
  const value = row && typeof row.value === 'number' ? row.value : null
  return { code, words: value === null ? '' : rublesAmountInWords(value) }
})

onMounted(async () => {
  await b24Instance.init()
  if (b24Instance.isInit()) {
    placementCode.value = b24Instance.getOrThrow().placement.placement
  }
})

/** Builds "100.00 USD = 287.50 BYN" lines for every currency with a value,
 *  anchored on the currently active row, and a trailing sum-in-words line.
 *  Plain numbers (dot, no grouping) for a clean chat paste. */
function buildMessage(): string {
  const lines = buildConversionLines(currencies.value, activeCurrency.value)
  if (lines.length === 0) return ''
  const header = ratesDate.value ? `${t('app.subtitle')} · ${t('app.ratesOn', { date: ratesDate.value })}` : t('app.subtitle')
  if (wordsRow.value.words) {
    lines.push(`${wordsRow.value.code} ${t('page.widget.inWords')}: ${capitalizeFirst(wordsRow.value.words)}`)
  }
  return `${header}\n${lines.join('\n')}`
}

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

/** Copies the conversion message to the clipboard — used from the mobile context
 *  menu, where there is no chat textarea to insert into. */
async function copyMessage() {
  const text = buildMessage()
  if (!text) return
  isBusy.value = true
  const ok = await writeToClipboard(text)
  toast.add(ok
    ? { title: t('page.widget.copied'), color: 'air-primary-success', duration: 1500 }
    : { title: t('page.widget.copyFailed'), color: 'air-primary-alert' })
  isBusy.value = false
}

/** Primary action depends on how the widget was opened: insert into the chat
 *  input (IM_TEXTAREA, web) or copy to clipboard (IMMOBILE_CONTEXT_MENU, mobile). */
function primaryAction() {
  return isMobileMenu.value ? copyMessage() : insertIntoChat()
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-(--ui-color-base-bg) flex flex-col p-2">
    <!-- Top bar: rate date + refresh. The widget title lives on the chat chip
         (placement TITLE), so we don't repeat it here — saves a line in 320px. -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <p class="text-[11px] text-(--ui-color-base-3) truncate min-w-0">
        {{ t('app.subtitle') }}<span v-if="ratesDate"> · {{ t('app.ratesOn', { date: ratesDate }) }}</span>
      </p>
      <B24Button
        :aria-label="t('app.refresh')"
        color="air-tertiary-no-accent"
        size="xs"
        :icon="RefreshIcon"
        :loading="refreshing"
        :disabled="loading"
        @click="refresh"
      />
    </div>

    <!-- Currency rows -->
    <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
      <div
        v-if="loading"
        class="space-y-1"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="h-8 animate-pulse rounded bg-(--ui-color-base-2)"
        />
      </div>
      <div
        v-else-if="fetchError"
        class="text-xs text-(--ui-color-accent-main-alert) p-2"
      >
        {{ fetchError }}
      </div>
      <div
        v-for="currency in currencies"
        v-else
        :key="currency.code"
        class="flex items-center gap-2"
        @click="onRowClick(currency.code)"
      >
        <span class="w-10 shrink-0 text-xs font-semibold text-(--ui-color-base-1)">
          {{ currency.code }}
        </span>
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
          size="xs"
          class="min-w-0 flex-1"
          :b24ui="{ base: 'text-right tabular-nums' }"
          @update:model-value="onValueUpdate(currency.code, $event)"
          @focus="onRowClick(currency.code)"
        />
      </div>
    </div>

    <!-- Insert + sum-in-words preview + footer -->
    <div class="mt-2 flex flex-col gap-1">
      <B24Button
        block
        size="sm"
        color="air-primary"
        :icon="isMobileMenu ? CopyIcon : SendIcon"
        :label="isMobileMenu ? t('page.widget.copy') : t('page.widget.insert')"
        :disabled="isBusy || !isReady || loading || !!fetchError"
        @click="primaryAction"
      />
      <!-- Passive preview of the sum-in-words that will go into the message. -->
      <p
        v-if="wordsRow.words"
        :title="wordsRow.words"
        class="text-[10px] text-(--ui-color-base-3) truncate px-1"
      >
        {{ wordsRow.code }} {{ t('page.widget.inWords') }}: {{ wordsRow.words }}
      </p>
      <div class="flex items-center justify-between text-[10px] text-(--ui-color-base-3) px-1">
        <a
          :href="siteUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline truncate"
        >
          {{ siteUrl.replace(/^https?:\/\//, '') }}
        </a>
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
