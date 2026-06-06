/**
 * Vue-free pieces of the copy-with-feedback composables: clipboard write, the
 * timer-backed flash state machine, and per-key colour selection. Kept pure so
 * they are unit-testable in the node test environment — the composables that
 * wrap them only add Vue refs and lifecycle cleanup.
 */

export type CopyState = 'idle' | 'ok' | 'err'

/** Default duration of the ok/err flash before returning to idle. */
export const COPY_FEEDBACK_MS = 1500

/**
 * Writes text to the clipboard.
 * @returns `true` on success; `false` on empty text, an insecure/unsupported
 *   context, or a write error — the caller decides how to surface it.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Mutable single-value holder — a Vue `Ref<CopyState>` satisfies this shape. */
export interface StateHolder {
  value: CopyState
}

export interface FlashController {
  /** Sets the state to `next` and schedules a reset back to `idle`. */
  flash: (next: 'ok' | 'err') => void
  /** Cancels a pending reset (call on unmount). */
  dispose: () => void
}

/** Timer-backed flash over a mutable state holder. */
export function createFlash(state: StateHolder, durationMs: number = COPY_FEEDBACK_MS): FlashController {
  let timer: ReturnType<typeof setTimeout> | null = null
  function flash(next: 'ok' | 'err') {
    state.value = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      state.value = 'idle'
    }, durationMs)
  }
  function dispose() {
    if (timer) clearTimeout(timer)
  }
  return { flash, dispose }
}

/**
 * Per-key feedback colour: the active key's `ok`/`err` colour while its flash
 * is showing, otherwise `idle`. Guarding on the idle state stops a row from
 * staying coloured after the flash resets (the active key lingers).
 */
export function pickColor<T extends string>(
  activeKey: string | null,
  state: CopyState,
  key: string,
  ok: T,
  err: T,
  idle: T
): T {
  if (activeKey !== key || state === 'idle') return idle
  return state === 'ok' ? ok : err
}
