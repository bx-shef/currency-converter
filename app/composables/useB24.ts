import type { B24FrameQueryParams } from '@bitrix24/b24jssdk'
import { B24Frame, Result, SdkError, initializeB24Frame, useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'

let $b24: undefined | B24Frame = undefined
const type = ref<'undefined' | 'B24Frame'>('undefined')

export const useB24 = () => {
  const { initB24Helper, getB24Helper } = useB24Helper()

  function get() {
    return $b24
  }

  function set(newValue: unknown | B24Frame | string): Result {
    const result = new Result()
    if (typeof newValue !== 'undefined' && typeof $b24 === 'undefined') {
      if (newValue instanceof B24Frame) {
        $b24 = newValue
        nextTick(() => {
          type.value = 'B24Frame'
        })
      }
    } else if (typeof newValue === 'undefined') {
      nextTick(() => {
        type.value = 'undefined'
      })
      $b24 = undefined
    }
    return result
  }

  async function init(): Promise<Result> {
    try {
      const queryParams: B24FrameQueryParams = {
        DOMAIN: null,
        PROTOCOL: false,
        APP_SID: null,
        LANG: null
      }

      if (typeof window !== 'undefined' && window.name) {
        const [domain, appSid] = window.name.split('|')
        queryParams.DOMAIN = domain ?? null
        queryParams.APP_SID = appSid ?? null
      }

      if (!queryParams.DOMAIN || !queryParams.APP_SID) {
        // Not inside B24 frame — fail silently, callers fall back to mock/standalone mode.
        throw new SdkError({
          code: 'JSSDK_CLIENT_SIDE_WARNING',
          description: 'Not running inside a Bitrix24 frame',
          status: 500
        })
      }

      const b24 = await initializeB24Frame({})
      await initB24Helper(b24, [
        LoadDataType.App,
        LoadDataType.Profile,
        LoadDataType.Currency
      ])
      // initB24Helper populates the helper singleton; the result is accessed via getB24Helper().
      void getB24Helper

      return set(b24)
    } catch {
      // intentionally swallowed — see comment above
    }
    return new Result()
  }

  function isInit() {
    return type.value !== 'undefined'
  }

  function targetOrigin() {
    return get()?.getTargetOrigin() || '?'
  }

  // Scopes required by IM_TEXTAREA placement: see issue #31 and the reference
  // app `bx-shef/app-convert-bbocode-md`. `placement` is needed for the install
  // flow itself; `im` for inserting text into the chat input; `user_brief` for
  // the diagnostics block on the install page.
  function getRequiredRights(): string[] {
    return ['user_brief', 'im', 'placement']
  }

  return {
    init,
    get,
    set,
    isInit,
    targetOrigin,
    getRequiredRights
  }
}
