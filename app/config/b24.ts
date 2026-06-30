/**
 * Bitrix24 integration constants (issue #31). Plain data, no SDK import — so the
 * required-scopes contract is unit-testable without the b24jssdk runtime.
 */

/**
 * Scopes requested when the app is installed into a portal:
 * `placement` — for `placement.bind` in the install flow;
 * `im` — to insert text into the chat input from the widget;
 * `user_brief` — the diagnostics block on the install page.
 */
export const B24_REQUIRED_SCOPES = ['user_brief', 'im', 'placement'] as const

/**
 * The single placement the converter widget binds to: the panel above the chat
 * message input. The widget reads/sets the chat textarea via the documented
 * `im:getImTextareaContent` / `im:setImTextareaContent` messenger methods
 * (https://apidocs.bitrix24.ru/sdk/b24jssdk/iframe-messenger-textarea.html).
 */
export const IM_TEXTAREA_PLACEMENT = 'IM_TEXTAREA'
