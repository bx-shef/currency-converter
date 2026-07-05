import { describe, expect, it, vi } from 'vitest'
import { reachMetrikaGoal } from '../app/utils/metrika'

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
