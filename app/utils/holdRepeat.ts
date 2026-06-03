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
 * action while a sustained hold streams accelerating repeats.
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
  start: (event: PointerEvent) => void
  stop: () => void
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
 * Stops on pointer up / leave / cancel and on unmount; ignores non-primary mouse
 * buttons and disabled elements (including becoming disabled mid-hold).
 */
export const vHoldRepeat: Directive<HTMLElement, (() => void) | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<(() => void) | undefined>) {
    const timing = DEFAULT_HOLD_TIMING
    let timer: ReturnType<typeof setTimeout> | null = null
    let interval = timing.interval

    function stop() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    function tick() {
      // The element may have become disabled (e.g. value reached its bound).
      if (isDisabled(el)) {
        stop()
        return
      }
      binding.value?.()
      interval = nextHoldInterval(interval, timing)
      timer = setTimeout(tick, interval)
    }

    function start(event: PointerEvent) {
      // Only the primary mouse button; touch/pen always report button 0.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (isDisabled(el)) return
      stop()
      interval = timing.interval
      timer = setTimeout(tick, timing.initialDelay)
    }

    el.addEventListener('pointerdown', start)
    el.addEventListener('pointerup', stop)
    el.addEventListener('pointerleave', stop)
    el.addEventListener('pointercancel', stop)

    stateByElement.set(el, { start, stop })
  },

  beforeUnmount(el: HTMLElement) {
    const state = stateByElement.get(el)
    if (!state) return
    state.stop()
    el.removeEventListener('pointerdown', state.start)
    el.removeEventListener('pointerup', state.stop)
    el.removeEventListener('pointerleave', state.stop)
    el.removeEventListener('pointercancel', state.stop)
    stateByElement.delete(el)
  }
}
