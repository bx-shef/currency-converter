import { createHash } from 'node:crypto'

// Security headers of every response — the Node server's copy of what nginx.conf used to send (issue #46,
// #88, #169). The CSP has no `script-src 'unsafe-inline'`: Nuxt's inline scripts (the FOUC theme-init guard and
// `window.__NUXT__.config`, whose hash changes per build) are allowed by sha256 hashes taken from the server's own
// render of the app pages on the first HTML request (server/middleware/00.security.ts).
//
// frame-ancestors: who may embed us — Bitrix24 cloud zones + self. connect-src: where the page may fetch —
// api.nbrb.by, Метрика and the same Bitrix24 zones (b24jssdk REST calls from /install). The two lists mirror
// each other; tests/securityHeaders.test.ts pins the exact set and the parity. Zones: Bitrix24's
// "Infrastructure and Sub-processors" doc plus the CIS zones it omits (.ru/.by/.kz/.ua/.net). Self-hosted
// portals on a custom domain must be added by hand. frame-ancestors is not narrowed per page: `/` is
// dual-mode (the Application URL opens inside the portal), so it needs the same allow-list as /install.

export const BITRIX24_ZONES = [
  'ru', 'by', 'com', 'net', 'eu', 'kz', 'ua', 'de', 'fr', 'it', 'pl', 'es', 'com.br', 'uk', 'com.tr', 'mx', 'co',
  'cn', 'in', 'id', 'jp', 'vn'
] as const

const portals = BITRIX24_ZONES.map(z => `https://*.bitrix24.${z}`).join(' ')

/** CSP with a placeholder for the inline-script hashes. */
export const CSP_TEMPLATE = [
  'default-src \'self\'',
  'script-src \'self\' __CSP_SCRIPT_HASHES__ mc.yandex.ru',
  // Vue/b24ui emit inline style attributes.
  'style-src \'self\' \'unsafe-inline\'',
  'img-src \'self\' mc.yandex.ru data:',
  `connect-src 'self' api.nbrb.by mc.yandex.ru ${portals}`,
  'font-src \'self\'',
  'object-src \'none\'',
  'form-action \'self\'',
  `frame-ancestors 'self' ${portals}`,
  'base-uri \'self\''
].join('; ') + ';'

export function buildCsp(hashes: string[]): string {
  if (!hashes.length) throw new Error('no inline-script hashes — refusing to send a CSP that would block the page')
  return CSP_TEMPLATE.replace('__CSP_SCRIPT_HASHES__', hashes.join(' '))
}

/** Headers on every response (pages, assets, API). No X-Frame-Options: framing by portals is allowed via CSP. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // The legacy XSS auditor is off on purpose (issue #46): protection comes from the CSP.
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), interest-cohort=()',
  // TLS terminates at the external nginx-proxy.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}

// Inline <script> = a script tag without a `src` attribute.
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g

/** `'sha256-…'` sources of every inline script in the given HTML documents, unique. */
export function inlineScriptHashes(htmls: string[]): string[] {
  const out = new Set<string>()
  for (const html of htmls) {
    for (const [, body] of html.matchAll(INLINE_SCRIPT)) out.add(`'sha256-${createHash('sha256').update(body ?? '', 'utf8').digest('base64')}'`)
  }
  return [...out]
}

/** Pages Bitrix24 opens with a POST (install handler, placement, Application URL); served as their prerendered HTML. */
export const APP_PAGES = ['/', '/install', '/widget/converter'] as const
