<script setup lang="ts">
import {
  isMarketplaceListing,
  resolveMarketplaceUrl,
  PROMO_MARKETPLACE
} from '~/utils/site'

// Promo shown under the calculator: the «app in Bitrix24» card (standalone only —
// hidden inside the portal iframe where the app is already installed; shown once a
// Marketplace listing exists) and the custom-development card (shown everywhere).
// Both cards are extracted, reusable components (see AppInBitrixCard / CustomDevCard).
const { public: { marketplaceUrl } } = useRuntimeConfig()

// Env override (NUXT_PUBLIC_MARKETPLACE_URL) if set, else the published constant.
const marketUrl = resolveMarketplaceUrl(marketplaceUrl)

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
    <AppInBitrixCard
      v-if="showMarketplace"
      :eyebrow="PROMO_MARKETPLACE.eyebrow"
      :title="PROMO_MARKETPLACE.title"
      :text="PROMO_MARKETPLACE.text"
      :cta-label="PROMO_MARKETPLACE.cta"
      :url="marketUrl"
      click-goal="market_card_click"
    />

    <CustomDevCard />
  </section>
</template>
