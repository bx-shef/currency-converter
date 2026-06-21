import { describe, expect, it } from 'vitest'
import { B24_REQUIRED_SCOPES, IM_TEXTAREA_PLACEMENT, IMMOBILE_CONTEXT_MENU_PLACEMENT } from '../app/config/b24'

describe('b24 config', () => {
  it('requests exactly the scopes the install flow needs', () => {
    // Regression guard: dropping `im` silently breaks chat insertion, `placement`
    // breaks the install bind, `user_brief` breaks diagnostics, `mobile` breaks
    // the IMMOBILE_CONTEXT_MENU placement (issue #89).
    expect([...B24_REQUIRED_SCOPES]).toEqual(['user_brief', 'im', 'placement', 'mobile'])
  })

  it('exposes the chat-panel and mobile context-menu placement codes', () => {
    expect(IM_TEXTAREA_PLACEMENT).toBe('IM_TEXTAREA')
    expect(IMMOBILE_CONTEXT_MENU_PLACEMENT).toBe('IMMOBILE_CONTEXT_MENU')
  })
})
