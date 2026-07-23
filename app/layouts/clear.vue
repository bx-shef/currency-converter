<script setup lang="ts">
// Minimal layout for the install handler and the chat widget — no site chrome
// (header/footer), but still inside <B24App> so b24ui components, the toaster
// (useToast) and the colour-mode tokens work inside the Bitrix24 iframe.
import { ru } from '@bitrix24/b24ui-nuxt/locale'
</script>

<template>
  <B24App :locale="ru">
    <!-- w-full, not w-screen: b24ui sets `body { scrollbar-gutter: stable }`, so a
         100vw box is always wider than the body content-box by the reserved
         scrollbar gutter → a few-px horizontal scrollbar in the narrow chat popup
         that shifted the layout right during copy-selection (issue #135). This is
         the width-defining element for /widget/converter and /install (B24App adds
         no width wrapper). overflow-x-hidden stays as defense-in-depth. -->
    <div class="min-h-screen w-full overflow-x-hidden bg-(--ui-color-base-bg)">
      <slot />
    </div>
  </B24App>
</template>
