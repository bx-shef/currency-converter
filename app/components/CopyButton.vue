<script setup lang="ts">
// Copy-to-clipboard button with ok/err flash feedback, extracted so the
// BYN/RUB/formula copy buttons on index.vue stop repeating the same B24Button
// markup + state→{color, aria} ternary (issue #82). The click is left to the
// parent (each button copies a different value) and falls through to B24Button.
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import { copyButtonProps, type CopyState } from '~/utils/copyFeedback'

const props = withDefaults(defineProps<{
  /** Flash state driving the colour + aria-label. */
  state: CopyState
  /** aria-label shown while idle (the ok/err labels are fixed RU, see #87). */
  label: string
  size?: 'sm' | 'lg'
}>(), { size: 'sm' })

const ui = computed(() => copyButtonProps(props.state, props.label))
</script>

<template>
  <B24Button
    type="button"
    :aria-label="ui.ariaLabel"
    :color="ui.color"
    :size="size"
    :icon="CopyIcon"
    class="shrink-0 me-[3px]"
  />
</template>
