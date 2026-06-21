/**
 * Bitrix24 integration constants (issue #31). Plain data, no SDK import — so the
 * required-scopes contract is unit-testable without the b24jssdk runtime.
 */

/**
 * Scopes requested when the app is installed into a portal:
 * `placement` — for `placement.bind` in the install flow;
 * `im` — to insert text into the chat input from the widget;
 * `user_brief` — the diagnostics block on the install page;
 * `mobile` — required by the mobile placement `IMMOBILE_CONTEXT_MENU` (issue #89).
 */
export const B24_REQUIRED_SCOPES = ['user_brief', 'im', 'placement', 'mobile'] as const

/** Chat-panel placement the converter widget binds to (desktop/web chat input). */
export const IM_TEXTAREA_PLACEMENT = 'IM_TEXTAREA'

/**
 * Mobile message context-menu placement (issue #89). Mirrors the documented
 * desktop `IM_CONTEXT_MENU` (same context: `dialogId` + `messageId`, opens in a
 * slider) — Bitrix24 had not published a dedicated `IMMOBILE_CONTEXT_MENU` page
 * at implementation time, so exact mobile behaviour is verified manually in a
 * portal. Requires the `mobile` scope.
 */
export const IMMOBILE_CONTEXT_MENU_PLACEMENT = 'IMMOBILE_CONTEXT_MENU'
