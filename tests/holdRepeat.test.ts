import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Directive, DirectiveBinding } from 'vue'
import { DEFAULT_HOLD_TIMING, nextHoldInterval, vHoldRepeat } from '../app/utils/holdRepeat'

describe('nextHoldInterval', () => {
  const timing = { initialDelay: 400, interval: 120, minInterval: 25, acceleration: 0.5 }

  it('applies the acceleration factor and rounds', () => {
    expect(nextHoldInterval(120, timing)).toBe(60)
    expect(nextHoldInterval(61, timing)).toBe(31) // 30.5 → 31
  })

  it('never drops below minInterval', () => {
    expect(nextHoldInterval(40, timing)).toBe(25) // 20 clamped to 25
    expect(nextHoldInterval(25, timing)).toBe(25)
  })

  it('default timing accelerates toward minInterval', () => {
    let interval = DEFAULT_HOLD_TIMING.interval
    for (let i = 0; i < 50; i++) interval = nextHoldInterval(interval, DEFAULT_HOLD_TIMING)
    expect(interval).toBe(DEFAULT_HOLD_TIMING.minInterval)
  })
})

/**
 * Minimal DOM-element stand-in: records listeners and attributes so directive
 * behaviour can be exercised under fake timers without jsdom.
 */
class MockElement {
  private listeners = new Map<string, Set<(e: unknown) => void>>()
  private attrs = new Map<string, string>()

  addEventListener(type: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.get(type)?.delete(fn)
  }

  hasAttribute(name: string) {
    return this.attrs.has(name)
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn(event)
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

function mount(el: MockElement, cb: () => void) {
  const binding = { value: cb } as DirectiveBinding<(() => void) | undefined>
  const directive = vHoldRepeat as Directive<HTMLElement, (() => void) | undefined> & {
    mounted: NonNullable<Directive['mounted']>
    beforeUnmount: NonNullable<Directive['beforeUnmount']>
  }
  // The directive only touches the EventTarget / attribute surface of the element.
  directive.mounted(el as unknown as HTMLElement, binding, null as never, null as never)
  return directive
}

describe('vHoldRepeat directive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not fire before the initial delay (a tap stays a single click)', () => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.initialDelay - 1)
    expect(cb).not.toHaveBeenCalled()

    el.dispatch('pointerup')
    vi.advanceTimersByTime(2000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('repeats with accelerating cadence while held', () => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.initialDelay)
    expect(cb).toHaveBeenCalledTimes(1)

    // Next tick fires after the (first) interval.
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.interval)
    expect(cb).toHaveBeenCalledTimes(2)

    // Acceleration: over a 1s window we get more ticks than the (un-accelerated)
    // starting cadence of 1000 / interval would allow.
    cb.mockClear()
    vi.advanceTimersByTime(1000)
    const unacceleratedTicks = Math.floor(1000 / DEFAULT_HOLD_TIMING.interval)
    expect(cb.mock.calls.length).toBeGreaterThan(unacceleratedTicks)
  })

  it('stops repeating on pointerup', () => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.initialDelay)
    expect(cb).toHaveBeenCalledTimes(1)

    el.dispatch('pointerup')
    cb.mockClear()
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it.each(['pointerleave', 'pointercancel'])('stops repeating on %s', (event) => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.initialDelay)
    el.dispatch(event)
    cb.mockClear()
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('ignores non-primary mouse buttons', () => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'mouse', button: 2 })
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not start when the element is disabled', () => {
    const el = new MockElement()
    el.setAttribute('disabled', '')
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('halts mid-hold once the element becomes disabled', () => {
    const el = new MockElement()
    const cb = vi.fn()
    mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    vi.advanceTimersByTime(DEFAULT_HOLD_TIMING.initialDelay)
    expect(cb).toHaveBeenCalledTimes(1)

    el.setAttribute('disabled', '') // e.g. value reached 0
    cb.mockClear()
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('cleans up listeners and timers on unmount', () => {
    const el = new MockElement()
    const cb = vi.fn()
    const directive = mount(el, cb)

    el.dispatch('pointerdown', { pointerType: 'touch', button: 0 })
    directive.beforeUnmount(el as unknown as HTMLElement, null as never, null as never, null as never)

    expect(el.listenerCount('pointerdown')).toBe(0)
    expect(el.listenerCount('pointerup')).toBe(0)

    cb.mockClear()
    vi.advanceTimersByTime(5000)
    expect(cb).not.toHaveBeenCalled()
  })
})
