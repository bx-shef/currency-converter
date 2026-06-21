<script setup lang="ts">
// Minimal layout for the install handler and the chat widget — no site chrome
// (header/footer), but still inside <B24App> so b24ui components, the toaster
// (useToast) and the colour-mode tokens work inside the Bitrix24 iframe.
import { ru } from '@bitrix24/b24ui-nuxt/locale'
</script>

<template>
  <B24App :locale="ru">
    <div class="min-h-screen w-screen overflow-x-hidden bg-(--ui-color-base-bg)">
      <slot />
    </div>
  </B24App>
</template>
