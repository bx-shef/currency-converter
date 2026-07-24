import { vi } from 'vitest'
import type { B24Frame, Result } from '@bitrix24/b24jssdk'
import type { useB24 } from '~/composables/useB24'

export interface MockB24Options {
  /** Placement code the widget reads via `$b24.placement.placement` (default IM_TEXTAREA). */
  placement?: () => string
  /** Whether a B24 frame is present (default true). `false` = standalone mode. */
  isInit?: () => boolean
  /** Spy capturing the chat-insert call `$b24.parent.message.send(...)`. */
  send?: ReturnType<typeof vi.fn>
}

/**
 * Typed fake of `useB24()`'s return for the widget/install component tests, which
 * can't load the real Bitrix24 SDK. The `ReturnType<typeof useB24>` annotation
 * makes TypeScript fail here if the composable's surface changes — so the mock
 * can't drift from the real API silently (review note on the #89 widget tests).
 */
export function makeMockB24(opts: MockB24Options = {}): ReturnType<typeof useB24> {
  const ok = { isSuccess: true } as unknown as Result
  const send = opts.send ?? vi.fn(async () => {})
  // The B24Frame fake is intentionally minimal — only `placement` + `parent.message.send`.
  // The full install flow (auth.getAuthData / actions.v2.batch.make / installFinish) is portal-only;
  // extend `MockB24Options` + `getOrThrow` here if a test ever needs that B24 branch.
  const inFrame = () => opts.isInit?.() ?? true
  return {
    init: vi.fn(async () => ok),
    // Mirror the real contract: get() yields the frame only once initialised
    // (standalone → undefined), so callers' `if (!$b24) return` path is exercised.
    get: () => (inFrame() ? ({} as unknown as B24Frame) : undefined),
    getOrThrow: () => ({
      placement: { placement: opts.placement?.() ?? 'IM_TEXTAREA' },
      parent: { message: { send } }
    }) as unknown as B24Frame,
    set: () => ok,
    isInit: inFrame,
    targetOrigin: () => 'https://example.bitrix24.by',
    getRequiredRights: () => []
  }
}
