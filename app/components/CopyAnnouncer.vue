<script setup lang="ts">
// Screen-reader announcement for copy results (issue #169). The copy buttons
// signal success only by colour and by swapping their own aria-label — neither
// reaches assistive tech, which re-reads a control on focus, not on attribute
// change. This visually hidden live region carries the outcome instead.
// One instance per page: pass every copy state, in a stable order.
import { copyAnnouncement, type CopyState } from '~/utils/copyFeedback'

const props = withDefaults(defineProps<{
  /** Copy states to watch, in a stable order. */
  states: readonly CopyState[]
  /** RU defaults match copyButtonProps; the multilingual widget passes t(). */
  okLabel?: string
  errLabel?: string
}>(), {
  okLabel: 'Скопировано',
  errLabel: 'Не удалось скопировать'
})

const message = ref('')

watch(() => [...props.states], async (next, prev) => {
  // Announce the state that JUST changed, not merely the first non-idle one:
  // a still-flashing 'ok' from an earlier button must never mask a later 'err',
  // which would read out success for a copy that actually failed.
  const changed = next.findIndex((s, i) => s !== 'idle' && s !== prev[i])
  if (changed === -1) {
    if (next.every(s => s === 'idle')) message.value = ''
    return
  }
  const text = copyAnnouncement(next[changed]!, props.okLabel, props.errLabel)
  // A live region only announces when its text CHANGES. Two copies in a row
  // produce the identical string, so blank it first and set it on the next tick.
  message.value = ''
  await nextTick()
  message.value = text
})

// Known limit: re-clicking the SAME button while its flash is still showing
// keeps the state at 'ok'/'ok', so nothing changes and nothing is announced.
// Rare enough (the flash lasts COPY_FEEDBACK_MS) to accept rather than thread a
// sequence counter through both copy composables.
</script>

<template>
  <!-- sr-only: conveys the result to screen readers without altering layout.
       `polite` waits for a pause instead of interrupting the user. role=status
       implies polite, but the explicit pair works around older AT bugs. -->
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>
