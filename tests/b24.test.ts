import { describe, expect, it } from 'vitest'
import { B24_REQUIRED_SCOPES, IM_TEXTAREA_PLACEMENT } from '../app/config/b24'

describe('b24 config', () => {
  it('requests exactly the scopes the install flow needs', () => {
    // Regression guard: dropping `im` silently breaks chat insertion, `placement`
    // breaks the install bind, `user_brief` breaks diagnostics.
    expect([...B24_REQUIRED_SCOPES]).toEqual(['user_brief', 'im', 'placement'])
  })

  it('binds the chat-panel placement', () => {
    expect(IM_TEXTAREA_PLACEMENT).toBe('IM_TEXTAREA')
  })
})
