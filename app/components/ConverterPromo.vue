<script setup lang="ts">
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'
import ArrowRightLIcon from '@bitrix24/b24icons-vue/outline/ArrowRightLIcon'
import DeveloperResourcesIcon from '@bitrix24/b24icons-vue/solid/DeveloperResourcesIcon'
import {
  marketplaceHref,
  isMarketplaceListing,
  PROMO_MARKETPLACE,
  PROMO_CUSTOM_DEV,
  CUSTOM_DEV_URL
} from '~/utils/site'

// Standalone-only promo shown under the calculator: a link to install the app in
// Bitrix24 and a custom-development offer. Hidden inside the portal iframe by the
// caller (index.vue), so it never clutters the in-portal view. Uses b24ui
// light/dark tokens — no forced theme (this is the plain tool page, not the
// dark branded landing).
const { public: { marketplaceUrl } } = useRuntimeConfig()

const marketHref = computed(() => marketplaceHref(marketplaceUrl as string))
const isListing = computed(() => isMarketplaceListing(marketplaceUrl as string))
const marketLabel = computed(() => isListing.value ? PROMO_MARKETPLACE.ctaMarket : PROMO_MARKETPLACE.ctaInstall)
</script>

<template>
  <section class="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 sm:max-w-[464px]">
    <!-- App in Bitrix24 -->
    <div class="rounded-2xl border border-cyan-400/40 bg-cyan-400/[0.04] p-5 dark:bg-cyan-400/[0.06] sm:p-6">
      <div class="mb-3 flex items-center gap-2">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-600 dark:text-cyan-300">
          <Bitrix24Icon class="size-5" />
        </span>
        <span class="text-[11px] font-medium uppercase tracking-wide text-cyan-700/80 dark:text-cyan-300/80">
          {{ PROMO_MARKETPLACE.eyebrow }}
        </span>
      </div>
      <h2 class="mb-1.5 text-lg font-semibold text-gray-900 dark:text-white">
        {{ PROMO_MARKETPLACE.title }}
      </h2>
      <p class="mb-4 text-sm leading-relaxed text-gray-600 dark:text-white/65">
        {{ PROMO_MARKETPLACE.text }}
      </p>
      <B24Button
        :label="marketLabel"
        :to="marketHref"
        :target="isListing ? '_blank' : undefined"
        :rel="isListing ? 'noopener noreferrer' : undefined"
        color="air-primary"
        size="md"
      >
        <template #trailing>
          <ArrowRightLIcon class="size-4" />
        </template>
      </B24Button>
    </div>

    <!-- Custom development offer -->
    <div class="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02] sm:p-6">
      <div class="mb-3 flex items-center gap-2">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-200/70 text-gray-500 dark:bg-white/10 dark:text-white/60">
          <DeveloperResourcesIcon class="size-5" />
        </span>
        <span class="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-white/45">
          {{ PROMO_CUSTOM_DEV.eyebrow }}
        </span>
      </div>
      <h2 class="mb-1.5 text-lg font-semibold text-gray-900 dark:text-white">
        {{ PROMO_CUSTOM_DEV.title }}
      </h2>
      <p class="mb-4 text-sm leading-relaxed text-gray-600 dark:text-white/65">
        {{ PROMO_CUSTOM_DEV.text }}
      </p>
      <B24Button
        :label="PROMO_CUSTOM_DEV.cta"
        :to="CUSTOM_DEV_URL"
        target="_blank"
        rel="noopener noreferrer"
        color="air-secondary-no-accent"
        size="md"
      >
        <template #trailing>
          <ArrowRightLIcon class="size-4" />
        </template>
      </B24Button>
    </div>
  </section>
</template>
