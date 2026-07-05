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
//    don't fabricate a link. On mobile it also carries a round fingerprint
//    button — hold it to reveal a QR of the Marketplace link (issue #30), the
//    same hold-to-reveal pattern as the bx-shef business card.
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

const showMarketplace = computed(() =>
  !isEmbedded.value && isMarketplaceListing(marketUrl))

// Mobile hold-to-reveal QR of the Marketplace link (issue #30). The QR is
// generated once on mount (only when a listing is configured); `qrcode` is
// dynamically imported so it never ships unless the card is actually present.
const qrUrl = ref('')
const showQr = ref(false)
let qrRevealed = false

onMounted(async () => {
  isEmbedded.value = window.self !== window.top
  // Skip QR work when the card won't render: inside an iframe (embedded) or with
  // no Marketplace listing configured. Avoids importing `qrcode` in the portal.
  if (isEmbedded.value || !isMarketplaceListing(marketUrl)) return
  try {
    const QRCode = (await import('qrcode')).default
    qrUrl.value = await QRCode.toDataURL(marketUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a1220', light: '#ffffff' }
    })
  } catch {
    // QR stays '' → the user sees a skeleton; non-critical.
  }
})

// Hold-to-reveal: pointer capture keeps the event on the button even if the
// finger drifts, so release reliably hides the QR again. contextmenu/long-press
// is suppressed on the button itself in the template.
function startQr(e: PointerEvent) {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  showQr.value = true
  if (!qrRevealed) {
    qrRevealed = true
    reachGoal('market_qr_reveal')
  }
}

function stopQr() {
  showQr.value = false
}
</script>

<template>
  <section class="mx-auto mt-6 flex w-full max-w-sm flex-col gap-4 sm:max-w-[464px]">
    <!-- App in Bitrix24 — only when a Marketplace listing is configured, standalone only -->
    <div
      v-if="showMarketplace"
      class="relative overflow-hidden rounded-2xl border border-cyan-400/40 bg-cyan-400/[0.04] p-5 dark:bg-cyan-400/[0.06] sm:p-6"
    >
      <!-- Mobile QR overlay — visible only while the fingerprint button is held.
           sm:hidden: on desktop the CTA opens the Marketplace directly. -->
      <div
        v-if="showQr"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/95 px-6 sm:hidden dark:bg-[#0a1220]/95"
      >
        <div class="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-500 dark:text-white/60">
          Сканируйте
        </div>
        <div class="rounded-2xl bg-white p-3 shadow-lg">
          <img
            v-if="qrUrl"
            :src="qrUrl"
            alt="QR-код приложения в Маркете Bitrix24"
            class="block size-[180px]"
          >
          <div
            v-else
            class="size-[180px] animate-pulse rounded bg-black/5"
          />
        </div>
        <div class="font-mono text-xs text-gray-500 dark:text-white/50">
          Маркет Bitrix24
        </div>
      </div>

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

      <!-- Mobile fingerprint → hold to reveal the Marketplace QR (issue #30).
           Anchored to the row's right edge — the natural right-thumb reach on a
           phone (the hint sits on the left). relative z-30 keeps the button
           above the overlay (z-20) so it stays visible and receives pointerup
           while held. -->
      <div class="relative z-30 mt-4 flex items-center justify-between gap-3 sm:hidden">
        <span class="font-mono text-[11px] text-gray-500 dark:text-white/60">
          {{ showQr ? 'Отпустите' : 'Удерживайте — QR Маркета' }}
        </span>
        <button
          type="button"
          class="flex size-16 shrink-0 touch-none select-none items-center justify-center rounded-full border transition-all duration-200 active:scale-95"
          :class="showQr
            ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-600 shadow-[0_0_24px_rgba(34,211,238,0.35)] dark:text-cyan-300'
            : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-600 dark:text-cyan-300'"
          aria-label="Показать QR-код Маркета Bitrix24 — удерживайте"
          @pointerdown.prevent="startQr"
          @pointerup="stopQr"
          @pointercancel="stopQr"
          @contextmenu.prevent
        >
          <!-- Fingerprint (inline SVG — not in this b24icons version). -->
          <svg
            class="size-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
            <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2" />
            <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
            <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
            <path d="M8.65 22c.21-.66.45-1.32.57-2" />
            <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
            <path d="M2 16h.01" />
            <path d="M21.8 16c.2-2 .131-5.354 0-6" />
            <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
          </svg>
        </button>
      </div>
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
