<script setup lang="ts">
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'
import ArrowRightLIcon from '@bitrix24/b24icons-vue/outline/ArrowRightLIcon'
import {
  isMarketplaceListing,
  PROMO_MARKETPLACE,
  PROMO_CUSTOM_DEV,
  CUSTOM_DEV_URL
} from '~/utils/site'
import { useMetrikaGoal } from '~/composables/useMetrikaGoal'

// Promo shown under the calculator. Two blocks with different visibility:
//  • «app in Bitrix24» card — standalone only (hidden inside the portal iframe,
//    where the app is already installed) AND only when a Marketplace listing is
//    configured (NUXT_PUBLIC_MARKETPLACE_URL); empty → the card is hidden, we
//    don't fabricate a link.
//  • custom-development banner — shown everywhere, incl. inside the portal (the
//    «order a customisation» offer is relevant there too). Styled as a premium
//    b24ui copilot card. Theme is native b24ui light/dark.
const { public: { marketplaceUrl } } = useRuntimeConfig()
const { reachGoal } = useMetrikaGoal()

// Marketplace listing URL (build-time constant baked into the SSG bundle).
const marketUrl = String(marketplaceUrl ?? '')

// Hidden inside any iframe embedding (e.g. the B24 portal) — same guard as
// metrika.js. Resolved on the client; SSG renders standalone (visible).
const isEmbedded = ref(false)
onMounted(() => {
  isEmbedded.value = window.self !== window.top
})

const showMarketplace = computed(() =>
  !isEmbedded.value && isMarketplaceListing(marketUrl))
</script>

<template>
  <section class="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 sm:max-w-[464px]">
    <!-- App in Bitrix24 — only when a Marketplace listing is configured, standalone only -->
    <div
      v-if="showMarketplace"
      class="rounded-2xl border border-cyan-400/40 bg-cyan-400/[0.04] p-5 dark:bg-cyan-400/[0.06] sm:p-6"
    >
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
        :label="PROMO_MARKETPLACE.cta"
        :to="marketUrl"
        target="_blank"
        rel="noopener noreferrer"
        color="air-primary"
        size="md"
        @click="reachGoal('market_click')"
      >
        <template #trailing>
          <ArrowRightLIcon class="size-4" />
        </template>
      </B24Button>
    </div>

    <!-- Custom development offer — premium copilot card, shown everywhere -->
    <B24Card
      variant="filled-copilot"
      :b24ui="{
        root: 'edge-dark rounded-2xl bg-[radial-gradient(110.42%_110.42%_at_-10.42%_31.25%,var(--ui-color-copilot-bg-content-3)_0%,var(--ui-color-copilot-bg-content-2)_58.65%,var(--ui-color-copilot-bg-content-1)_100%)]',
        header: 'p-5 sm:p-6',
        body: 'px-5 sm:px-6',
        footer: 'p-5 sm:p-6'
      }"
    >
      <template #header>
        <div class="flex flex-col gap-1.5">
          <span class="text-[11px] font-medium uppercase tracking-wide opacity-70">
            {{ PROMO_CUSTOM_DEV.eyebrow }}
          </span>
          <div class="text-(length:--ui-font-size-2xl)/[normal] font-(--ui-font-weight-semi-bold)">
            {{ PROMO_CUSTOM_DEV.title }}
          </div>
        </div>
      </template>

      <p class="text-(length:--ui-font-size-md)/[1.5] opacity-90">
        {{ PROMO_CUSTOM_DEV.text }}
      </p>

      <template #footer>
        <B24Button
          :label="PROMO_CUSTOM_DEV.cta"
          :to="CUSTOM_DEV_URL"
          target="_blank"
          rel="noopener noreferrer"
          color="air-boost"
          size="md"
          @click="reachGoal('custom_dev_click')"
        >
          <template #trailing>
            <ArrowRightLIcon class="size-4" />
          </template>
        </B24Button>
      </template>
    </B24Card>
  </section>
</template>
