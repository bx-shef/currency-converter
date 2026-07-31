<script setup lang="ts">
// Screen-reader announcement for copy results (issue #169). The copy buttons
// signal success only by colour and by swapping their own aria-label — neither
// reaches assistive tech, which re-reads a control on focus, not on attribute
// change. This visually hidden live region carries the outcome instead.
// One instance per page is enough: pass every copy state, the first non-idle
// one wins (only one flash runs at a time in practice).
import { copyAnnouncement, firstActiveState, type CopyState } from '~/utils/copyFeedback'

const props = withDefaults(defineProps<{
  /** Copy states to watch — the first non-idle one is announced. */
  states: readonly CopyState[]
  /** RU defaults match copyButtonProps; the multilingual widget passes t(). */
  okLabel?: string
  errLabel?: string
}>(), {
  okLabel: 'Скопировано',
  errLabel: 'Не удалось скопировать'
})

const message = computed(() =>
  copyAnnouncement(firstActiveState(props.states), props.okLabel, props.errLabel))
</script>

<template>
  <!-- sr-only: conveys the result to screen readers without altering layout.
       `polite` waits for a pause instead of interrupting the user. -->
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>
