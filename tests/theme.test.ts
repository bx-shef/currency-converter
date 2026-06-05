import { describe, expect, it } from 'vitest'
import { isTheme, oppositeTheme, resolveInitialTheme, THEME_KEY } from '../app/utils/theme'

describe('isTheme', () => {
  it('accepts only "light" / "dark"', () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('Dark')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme(1)).toBe(false)
  })
})

describe('resolveInitialTheme', () => {
  it('prefers a valid saved choice over the system preference', () => {
    expect(resolveInitialTheme('light', true)).toBe('light')
    expect(resolveInitialTheme('dark', false)).toBe('dark')
  })

  it('falls back to the system preference when nothing valid is saved', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark')
    expect(resolveInitialTheme(null, false)).toBe('light')
    expect(resolveInitialTheme('bogus', true)).toBe('dark')
    expect(resolveInitialTheme('', false)).toBe('light')
  })
})

describe('oppositeTheme', () => {
  it('flips the theme', () => {
    expect(oppositeTheme('dark')).toBe('light')
    expect(oppositeTheme('light')).toBe('dark')
  })
})

describe('THEME_KEY', () => {
  it('is the stable storage key', () => {
    expect(THEME_KEY).toBe('theme')
  })
})
