import { B24Frame, Result, initializeB24Frame, useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
import { B24_REQUIRED_SCOPES } from '~/config/b24'

let $b24: undefined | B24Frame = undefined
const type = ref<'undefined' | 'B24Frame'>('undefined')

export const useB24 = () => {
  const { initB24Helper } = useB24Helper()

  function get() {
    return $b24
  }

  /** Returns the live B24Frame or throws — call only after `isInit()` is true. */
  function getOrThrow(): B24Frame {
    if (!$b24) throw new Error('B24Frame is not initialised')
    return $b24
  }

  function set(newValue: B24Frame | undefined): Result {
    // Update `type` synchronously (issue #88): `set()` is called from `init()`
    // inside onMounted (post-render), so there's no "mutate during render" risk,
    // and the install page relies on isInit() being accurate immediately after
    // `await init()` resolves (a deferred flip lagged a microtask behind).
    if (newValue instanceof B24Frame) {
      if (!$b24) {
        $b24 = newValue
        type.value = 'B24Frame'
      }
    } else {
      $b24 = undefined
      type.value = 'undefined'
    }
    return new Result()
  }

  async function init(): Promise<Result> {
    // Already initialised (e.g. the install page's retry button) — don't
    // re-create the SDK singleton, which would leak a second B24Frame.
    if ($b24) return new Result()
    // The B24 portal sets `window.name = "domain|protocol|appSid"` on the iframe.
    // When it's absent we're standalone — no-op so callers fall back to mock mode.
    // `initializeB24Frame` does its own parsing/handshake; we only gate on presence.
    if (typeof window === 'undefined' || !window.name) return new Result()
    try {
      const b24 = await initializeB24Frame({})
      await initB24Helper(b24, [
        LoadDataType.App,
        LoadDataType.Profile,
        LoadDataType.Currency
      ])
      return set(b24)
    } catch (error) {
      // Thrown when not genuinely inside a portal — swallow, stay standalone.
      // Keep the real cause in the console: the install page surfaces only a
      // generic handshake message, so this is the diagnostic trail.
      console.warn('[useB24] init failed', error)
    }
    return new Result()
  }

  function isInit() {
    return type.value !== 'undefined'
  }

  function targetOrigin() {
    return get()?.getTargetOrigin() || '?'
  }

  /** Scopes the install handler requests; see `app/config/b24.ts`. */
  function getRequiredRights(): string[] {
    return [...B24_REQUIRED_SCOPES]
  }

  return {
    init,
    get,
    getOrThrow,
    set,
    isInit,
    targetOrigin,
    getRequiredRights
  }
}
