<script setup lang="ts">
import type { B24Frame } from '@bitrix24/b24jssdk'
import RefreshIcon from '@bitrix24/b24icons-vue/solid/RefreshIcon'
import { useCurrencyConverter, STEP } from '~/composables/useCurrencyConverter'
import { useB24 } from '~/composables/useB24'

const { t } = useI18n()
const b24Instance = useB24()
const isB24 = computed(() => b24Instance.isInit())

const {
  currencies,
  ratesDate,
  loading,
  refreshing,
  fetchError,
  activeCurrency,
  bootstrap,
  refresh,
  onValueUpdate,
  removeCurrency
} = useCurrencyConverter()

useSeoMeta({
  title: t('page.index.seo.title'),
  description: t('page.index.seo.description'),
  ogTitle: t('page.index.seo.title'),
  ogDescription: t('page.index.seo.description'),
  ogImage: '/og.png',
  ogType: 'website',
  twitterCard: 'summary_large_image'
})

onMounted(async () => {
  await bootstrap()
  if (isB24.value) {
    try {
      const $b24 = b24Instance.get() as B24Frame
      await $b24.parent.setTitle(t('page.index.seo.title'))
    } catch {
      // setTitle is best-effort — failure inside the frame is non-fatal
    }
  }
})
</script>

<template>
  <div class="flex justify-center px-3 py-3 sm:py-6">
    <div class="w-full max-w-sm">
      <div class="mb-2 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h1 class="text-lg font-bold leading-tight text-gray-900 dark:text-white sm:text-2xl">
            {{ t('app.title') }}
          </h1>
          <p class="text-xs font-medium text-blue-600 dark:text-blue-400 sm:text-sm">
            {{ t('app.subtitle') }}<span
              v-if="ratesDate"
              class="text-gray-500 dark:text-gray-400"
            > · {{ t('app.ratesOn', { date: ratesDate }) }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <B24Badge
            :label="isB24 ? t('mode.b24') : t('mode.standalone')"
            :color="isB24 ? 'air-primary-success' : 'air-primary-warning'"
            variant="soft"
            size="sm"
          />
          <B24Button
            :aria-label="t('app.refresh')"
            color="air-tertiary-no-accent"
            size="sm"
            :icon="RefreshIcon"
            :loading="refreshing"
            :disabled="loading"
            @click="refresh"
          />
        </div>
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
            :model-modifiers="{ optional: true }"
            :step="STEP"
            :min="0"
            :max="1e12"
            :highlight="currency.code === activeCurrency"
            size="sm"
            class="min-w-0 flex-1"
            :b24ui="{ base: 'text-right' }"
            @update:model-value="onValueUpdate(currency.code, $event)"
            @focus="activeCurrency = currency.code"
          />
          <B24Button
            v-if="currency.removable"
            type="button"
            :aria-label="t('app.remove', { name: currency.name })"
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
