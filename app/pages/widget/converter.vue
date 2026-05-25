<script setup lang="ts">
import type { B24Frame } from '@bitrix24/b24jssdk'
import { Text } from '@bitrix24/b24jssdk'
import { computed, onMounted } from 'vue'
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import SendIcon from '@bitrix24/b24icons-vue/outline/SendIcon'
import { useB24 } from '~/composables/useB24'
import { useCurrencyConverter, STEP } from '~/composables/useCurrencyConverter'

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
  bootstrap,
  refresh,
  onValueUpdate
} = useCurrencyConverter()

useHead({ title: t('page.widget.seo.title') })

const isBusy = ref(false)

// Strip anything that isn't an http(s) URL — these come from env vars an operator
// controls, but we render them as `:href` and don't want a `javascript:...` value
// to slip through if the deploy config is ever misconfigured/tampered with.
function safeHttpUrl(raw: string, fallback: string): string {
  if (!raw) return fallback
  return /^https?:\/\//i.test(raw) ? raw : fallback
}

const authorName = (config.public.authorName as string) || 'bx-shef'
const authorUrl = safeHttpUrl(config.public.authorUrl as string, 'https://bx-shef.by')
const siteUrl = safeHttpUrl(config.public.siteUrl as string, 'https://github.com/bx-shef/currency-converter')

onMounted(async () => {
  await b24Instance.init()
  await bootstrap()
})

// Converter rounds to 4 decimals, which leaks float noise into chat lines like
// "287.4999" — format to 2 decimals for the message body since this is a chat
// insert (final destination), not the in-form value the user is still editing.
function formatAmount(n: number): string {
  return n.toFixed(2)
}

/** Builds "100.00 USD = 287.50 BYN" lines for every currency with a value,
 *  anchored on the currently active row. Kept compact for a chat insert. */
function buildMessage(): string {
  const active = currencies.value.find(c => c.code === activeCurrency.value)
  if (!active || typeof active.value !== 'number') return ''

  const lines: string[] = []
  for (const c of currencies.value) {
    if (c.code === active.code) continue
    if (typeof c.value !== 'number') continue
    lines.push(`${formatAmount(active.value)} ${active.code} = ${formatAmount(c.value)} ${c.code}`)
  }
  if (lines.length === 0) return ''
  const header = ratesDate.value ? `${t('app.subtitle')} · ${t('app.ratesOn', { date: ratesDate.value })}` : t('app.subtitle')
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
    const $b24 = b24Instance.get() as B24Frame
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
  <div class="h-screen w-screen overflow-hidden bg-(--ui-color-base-bg) flex flex-col p-2">
    <!-- Top bar: title + refresh -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="min-w-0">
        <h1 class="text-sm font-semibold text-(--ui-color-base-1) truncate">
          {{ t('app.title') }}
        </h1>
        <p class="text-[10px] text-(--ui-color-base-3) truncate">
          {{ t('app.subtitle') }}<span v-if="ratesDate"> · {{ t('app.ratesOn', { date: ratesDate }) }}</span>
        </p>
      </div>
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
      >
        <span class="w-10 shrink-0 text-xs font-semibold text-(--ui-color-base-1)">
          {{ currency.code }}
        </span>
        <B24InputNumber
          :model-value="currency.value"
          :model-modifiers="{ optional: true }"
          :step="STEP"
          :min="0"
          :max="1e12"
          :highlight="currency.code === activeCurrency"
          size="xs"
          class="min-w-0 flex-1"
          :b24ui="{ base: 'text-right' }"
          @update:model-value="onValueUpdate(currency.code, $event)"
          @focus="activeCurrency = currency.code"
        />
      </div>
    </div>

    <!-- Insert + footer -->
    <div class="mt-2 flex flex-col gap-1">
      <B24Button
        block
        size="sm"
        color="air-primary"
        :icon="SendIcon"
        :label="t('page.widget.insert')"
        :disabled="isBusy || !isReady || loading || !!fetchError"
        @click="insertIntoChat"
      />
      <div class="flex items-center justify-between text-[10px] text-(--ui-color-base-3) px-1">
        <a
          :href="siteUrl"
          target="_blank"
          rel="noopener"
          class="hover:underline"
        >
          {{ siteUrl.replace(/^https?:\/\//, '') }}
        </a>
        <span>
          {{ t('footer.by') }}
          <a
            :href="authorUrl"
            target="_blank"
            rel="noopener"
            class="hover:underline"
          >{{ authorName }}</a>
        </span>
      </div>
    </div>
  </div>
</template>
