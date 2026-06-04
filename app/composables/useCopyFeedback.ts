/**
 * Clipboard copy with transient visual feedback (issue #48). Thin Vue wrappers
 * around the pure helpers in `~/utils/copyFeedback`; `onBeforeUnmount` is
 * registered only when a component instance is active so these can also be used
 * outside a component if ever needed.
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { COPY_FEEDBACK_MS, createFlash, pickColor, writeToClipboard, type CopyState } from '~/utils/copyFeedback'

/** Single-target copy feedback (e.g. one "sum in words" line). */
export function useCopyFeedback(durationMs: number = COPY_FEEDBACK_MS) {
  const state = ref<CopyState>('idle')
  const { flash, dispose } = createFlash(state, durationMs)
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  async function copy(text: string) {
    if (!text) return
    flash(await writeToClipboard(text) ? 'ok' : 'err')
  }
  return { state, copy, dispose }
}

/**
 * Keyed copy feedback for a list: only the last-copied key flashes. `activeKey`
 * lingers after the flash resets, so {@link colorFor} also checks the state.
 */
export function useKeyedCopyFeedback(durationMs: number = COPY_FEEDBACK_MS) {
  const activeKey = ref<string | null>(null)
  const state = ref<CopyState>('idle')
  const { flash, dispose } = createFlash(state, durationMs)
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  async function copy(key: string, text: string) {
    if (!text) return
    activeKey.value = key
    flash(await writeToClipboard(text) ? 'ok' : 'err')
  }
  /** Resolves a per-key feedback colour: active only while the flash is showing. */
  function colorFor<T extends string>(key: string, ok: T, err: T, idle: T): T {
    return pickColor(activeKey.value, state.value, key, ok, err, idle)
  }
  return { activeKey, state, copy, colorFor, dispose }
}
