import { createHash } from 'node:crypto'
import { THEME_INIT_SCRIPT } from '../../app/utils/themeInit'

// Security headers of every response — the Node server's copy of what nginx.conf used to send (issue #46,
// #88, #169). The CSP has no `script-src 'unsafe-inline'`: Nuxt's inline scripts (the FOUC theme-init guard and
// `window.__NUXT__.config`, whose hash changes per build) are allowed by sha256 hashes of the inline scripts of each
// rendered response (server/plugins/csp.ts).
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

/** CSP with the given `'sha256-…'` sources; none → only same-origin scripts (never 'unsafe-inline'). */
export function buildCsp(hashes: string[]): string {
  return CSP_TEMPLATE.replace(' __CSP_SCRIPT_HASHES__', hashes.length ? ` ${hashes.join(' ')}` : '')
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

/**
 * The 404 page's «back» script — verbatim from Nuxt (nuxt/dist/app/components/error-404.vue); a Nuxt update that
 * changes it is caught by tests/securityHeaders.test.ts (the copy is compared with the installed Nuxt).
 */
export const NUXT_ERROR_BACK_SCRIPT = '(()=>{if(!(window.history.state&&window.history.state.back||document.referrer.startsWith(window.location.origin+"/")))return;const t=document.querySelector("[data-back-home]"),e=document.querySelector("[data-back-previous]");t&&e&&(e.onclick=()=>window.history.back(),t.hidden=!0,e.hidden=!1)})();'

const NUXT_CONFIG_PREFIX = 'window.__NUXT__={};window.__NUXT__.config='

// Inline <script> = a script tag without a `src` attribute (`data-src` is not `src`).
const INLINE_SCRIPT = /<script((?:(?!\ssrc=)[^>])*)>([\s\S]*?)<\/script>/g

const hashOf = (body: string) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`

/** `'sha256-…'` sources of every inline script in the given HTML documents, unique (no allow-list — tooling). */
export function inlineScriptHashes(htmls: string[]): string[] {
  const out = new Set<string>()
  for (const html of htmls) {
    for (const m of html.matchAll(INLINE_SCRIPT)) out.add(hashOf(m[2] ?? ''))
  }
  return [...out]
}

/** importmap of Nuxt: only `{ "imports": { name: "/_nuxt/….js" } }`. */
function isNuxtImportMap(body: string): boolean {
  try {
    const v = JSON.parse(body) as Record<string, unknown>
    const keys = Object.keys(v)
    const imports = v.imports as Record<string, unknown> | undefined
    return keys.length === 1 && keys[0] === 'imports' && !!imports && typeof imports === 'object'
      && Object.values(imports).every(u => typeof u === 'string' && /^\/_nuxt\/[\w.-]+\.js$/.test(u))
  } catch {
    return false
  }
}

/**
 * ⚠ Do not add inline scripts at the end of <body> (`useHead` with `tagPosition: 'bodyClose'`) that carry request
 * data: the `__NUXT__.config` rule trusts the LAST such script, and an injection placed after it would win.
 *
 * Hashes of the KNOWN executable inline scripts of one rendered page — never «every inline script»: a `<script>`
 * injected into the markup (a future v-html, an error reflection) must stay blocked by the CSP.
 * - `theme-init` — exactly THEME_INIT_SCRIPT;
 * - Nuxt importmap — `/_nuxt/` entries only;
 * - `window.__NUXT__.config` — only the LAST such script: Nuxt puts it at the end of <body>, after the app root,
 *   so anything injected inside the app comes earlier and is not allowed;
 * - the 404 «back» script — exactly NUXT_ERROR_BACK_SCRIPT.
 * Non-JavaScript blocks (`application/json` payload) are not scripts for the CSP and are skipped.
 */
export function allowedInlineScriptHashes(html: string): string[] {
  const out = new Set<string>()
  let lastConfig: string | null = null
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    const attrs = m[1] ?? ''
    const body = m[2] ?? ''
    const type = /\stype="([^"]*)"/.exec(attrs)?.[1]
    if (type === 'importmap') {
      if (isNuxtImportMap(body)) out.add(hashOf(body))
    } else if (type && type !== 'module' && type !== 'text/javascript') {
      continue
    } else if (body === THEME_INIT_SCRIPT || body === NUXT_ERROR_BACK_SCRIPT) {
      out.add(hashOf(body))
    } else if (body.startsWith(NUXT_CONFIG_PREFIX)) {
      lastConfig = body
    }
  }
  if (lastConfig !== null) out.add(hashOf(lastConfig))
  return [...out]
}
