/**
 * Press-and-hold auto-repeat for +/− buttons.
 *
 * Exposes a Vue directive (`vHoldRepeat`) that fires a callback repeatedly while
 * a pointer is held down on the bound element, plus the pure timing helper it
 * relies on so the acceleration curve can be unit-tested without a DOM.
 *
 * The directive intentionally does NOT fire on the initial press — the element's
 * own `@click` handler covers a single tap (and keyboard activation). The
 * directive only kicks in after `initialDelay`, so a quick tap yields exactly one
 * action while a sustained hold streams accelerating repeats. Once a hold has
 * auto-repeated, the synthetic `click` the browser emits on release is swallowed
 * so the press does not also fire `@click` (which would add an extra step).
 */
import type { Directive, DirectiveBinding } from 'vue'

/** Timing parameters for press-and-hold auto-repeat. */
export interface HoldRepeatTiming {
  /** Delay before auto-repeat begins after the initial press (ms). */
  initialDelay: number
  /** Interval between the first repeats (ms). */
  interval: number
  /** Fastest interval the repeat accelerates to (ms). */
  minInterval: number
  /** Factor applied to the interval after each tick; `< 1` accelerates. */
  acceleration: number
}

export const DEFAULT_HOLD_TIMING: HoldRepeatTiming = {
  initialDelay: 400,
  interval: 120,
  minInterval: 25,
  acceleration: 0.82
}

/** Grace window for swallowing the post-hold `click` if it never arrives (ms). */
const CLICK_SUPPRESS_GRACE_MS = 350

/**
 * Computes the next (accelerated) repeat interval, clamped to `minInterval`.
 * Pure function — extracted for unit testing.
 *
 * @param current current interval in ms.
 * @param timing acceleration parameters.
 * @returns the next interval, never below `timing.minInterval`.
 */
export function nextHoldInterval(current: number, timing: HoldRepeatTiming): number {
  return Math.max(timing.minInterval, Math.round(current * timing.acceleration))
}

/** Per-element runtime state, kept off the DOM node via a WeakMap. */
interface HoldRepeatState {
  /** Latest bound callback; refreshed by the `updated` hook to avoid stale closures. */
  callback: (() => void) | undefined
  start: (event: PointerEvent) => void
  stop: () => void
  cleanup: () => void
}

const stateByElement = new WeakMap<HTMLElement, HoldRepeatState>()

/** True when the element is disabled and should not auto-repeat. */
function isDisabled(el: HTMLElement): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
}

/**
 * `v-hold-repeat="() => doSomething()"` — repeatedly invokes the bound callback
 * while the pointer is held down, with an initial delay and accelerating cadence.
 *
 * Stops on pointer up / leave / cancel, on window blur / tab hide, and on unmount;
 * ignores non-primary mouse buttons and disabled elements (including becoming
 * disabled mid-hold). The bound callback is refreshed via the `updated` hook.
 */
export const vHoldRepeat: Directive<HTMLElement, (() => void) | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<(() => void) | undefined>) {
    const timing = DEFAULT_HOLD_TIMING
    let timer: ReturnType<typeof setTimeout> | null = null
    let suppressTimer: ReturnType<typeof setTimeout> | null = null
    let interval = timing.interval
    /** Whether the current/last press auto-repeated at least once. */
    let didRepeat = false

    function suppressNextClick(event: Event) {
      // Capture phase + stopImmediatePropagation prevents the element's own
      // bubble-phase @click from firing after an auto-repeating hold.
      event.stopImmediatePropagation()
      event.preventDefault()
      removeClickSuppressor()
    }

    function removeClickSuppressor() {
      el.removeEventListener('click', suppressNextClick, true)
      if (suppressTimer !== null) {
        clearTimeout(suppressTimer)
        suppressTimer = null
      }
    }

    function stop() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (didRepeat) {
        didRepeat = false
        // Swallow the synthetic click the browser fires on release after a hold.
        el.addEventListener('click', suppressNextClick, true)
        suppressTimer = setTimeout(removeClickSuppressor, CLICK_SUPPRESS_GRACE_MS)
      }
    }

    function tick() {
      // The element may have become disabled (e.g. value reached its bound).
      if (isDisabled(el)) {
        stop()
        return
      }
      state.callback?.()
      didRepeat = true
      interval = nextHoldInterval(interval, timing)
      timer = setTimeout(tick, interval)
    }

    function start(event: PointerEvent) {
      // Only the primary mouse button; touch/pen always report button 0.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (isDisabled(el)) return
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      // A fresh press must not inherit a pending click-suppressor from a prior hold.
      removeClickSuppressor()
      didRepeat = false
      interval = timing.interval
      timer = setTimeout(tick, timing.initialDelay)
    }

    function onVisibilityChange() {
      if (typeof document !== 'undefined' && document.hidden) stop()
    }

    function cleanup() {
      stop()
      removeClickSuppressor()
      el.removeEventListener('pointerdown', start)
      el.removeEventListener('pointerup', stop)
      el.removeEventListener('pointerleave', stop)
      el.removeEventListener('pointercancel', stop)
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', stop)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }

    const state: HoldRepeatState = { callback: binding.value, start, stop, cleanup }

    el.addEventListener('pointerdown', start)
    el.addEventListener('pointerup', stop)
    // `pointerleave` covers a mouse dragged off the button; on touch the pointer is
    // implicitly captured, so release is handled by pointerup/pointercancel instead.
    el.addEventListener('pointerleave', stop)
    el.addEventListener('pointercancel', stop)
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', stop)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    stateByElement.set(el, state)
  },

  updated(el: HTMLElement, binding: DirectiveBinding<(() => void) | undefined>) {
    const state = stateByElement.get(el)
    if (state) state.callback = binding.value
  },

  beforeUnmount(el: HTMLElement) {
    const state = stateByElement.get(el)
    if (!state) return
    state.cleanup()
    stateByElement.delete(el)
  }
}
