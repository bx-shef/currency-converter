import { describe, expect, it, vi } from 'vitest'
import { isValidCounterId, reachMetrikaGoal } from '../app/utils/metrika'

describe('reachMetrikaGoal', () => {
  it('calls ym(id, "reachGoal", goal) with a valid numeric counter', () => {
    const ym = vi.fn()
    expect(reachMetrikaGoal(ym, '12345', 'market_click')).toBe(true)
    expect(ym).toHaveBeenCalledWith(12345, 'reachGoal', 'market_click')
  })

  it('accepts a numeric counter id too', () => {
    const ym = vi.fn()
    expect(reachMetrikaGoal(ym, 777, 'custom_dev_click')).toBe(true)
    expect(ym).toHaveBeenCalledWith(777, 'reachGoal', 'custom_dev_click')
  })

  it('is a no-op for a blank/invalid/zero counter (tracking off)', () => {
    const ym = vi.fn()
    expect(reachMetrikaGoal(ym, '', 'g')).toBe(false)
    expect(reachMetrikaGoal(ym, '   ', 'g')).toBe(false)
    expect(reachMetrikaGoal(ym, '0', 'g')).toBe(false)
    expect(reachMetrikaGoal(ym, 'abc', 'g')).toBe(false)
    expect(reachMetrikaGoal(ym, undefined, 'g')).toBe(false)
    expect(reachMetrikaGoal(ym, null, 'g')).toBe(false)
    expect(ym).not.toHaveBeenCalled()
  })

  it('is a no-op when ym is not a function (Metrika not loaded)', () => {
    expect(reachMetrikaGoal(undefined, '123', 'g')).toBe(false)
    expect(reachMetrikaGoal(null, '123', 'g')).toBe(false)
    expect(reachMetrikaGoal({}, '123', 'g')).toBe(false)
  })
})

describe('isValidCounterId', () => {
  it('accepts a non-empty string of digits', () => {
    expect(isValidCounterId('12345')).toBe(true)
    expect(isValidCounterId('0')).toBe(true) // digits only; runtime still no-ops a 0 counter
    expect(isValidCounterId('007')).toBe(true)
  })

  it('rejects anything that is not pure digits (incl. spaces, so the build guard catches typos)', () => {
    expect(isValidCounterId('')).toBe(false)
    expect(isValidCounterId(' 12345 ')).toBe(false) // surrounding spaces → build fails, not silent-off
    expect(isValidCounterId('12a')).toBe(false)
    expect(isValidCounterId('1.5')).toBe(false)
    expect(isValidCounterId('-5')).toBe(false)
    expect(isValidCounterId('1e5')).toBe(false)
  })
})
