// Shared iframe check — the app runs standalone or inside the Bitrix24 portal
// iframe, and several places gate behaviour on that (analytics, promo cards,
// web-vitals). Pure + injectable so it's testable without a real frame.

/**
 * True when running inside an iframe (e.g. the B24 portal). Fail-closed: a
 * cross-origin access error means we ARE embedded, so callers that suppress
 * tracking in the portal stay on the safe side.
 *
 * Note: `public/metrika.js` keeps its own inline copy of this check — it's a
 * standalone script loaded before the app bundle, so it can't import this util.
 */
export function isEmbedded(win: Pick<Window, 'self' | 'top'> = window): boolean {
  try {
    return win.self !== win.top
  } catch {
    return true
  }
}
