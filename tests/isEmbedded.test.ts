import { describe, expect, it } from 'vitest'
import { isEmbedded } from '../app/utils/isEmbedded'

describe('isEmbedded', () => {
  it('is false when self === top (standalone)', () => {
    const win = {} as Window
    const self = win
    expect(isEmbedded({ self, top: self } as Pick<Window, 'self' | 'top'>)).toBe(false)
  })

  it('is true when self !== top (framed)', () => {
    expect(isEmbedded({ self: {}, top: {} } as Pick<Window, 'self' | 'top'>)).toBe(true)
  })

  it('fails closed (true) when accessing top throws cross-origin', () => {
    const win = {
      get self() { return this },
      get top(): Window { throw new Error('cross-origin') }
    } as unknown as Pick<Window, 'self' | 'top'>
    expect(isEmbedded(win)).toBe(true)
  })
})
