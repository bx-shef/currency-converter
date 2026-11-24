import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { allowedInlineScriptHashes, BITRIX24_ZONES, buildCsp, CSP_TEMPLATE, inlineScriptHashes, NUXT_ERROR_BACK_SCRIPT, SECURITY_HEADERS } from '../server/lib/security'
import { THEME_INIT_SCRIPT } from '../app/utils/themeInit'

// Guards the CSP and security headers the Node server sends (server/lib/security.ts; nginx.conf before #200).
// The Bitrix24 cloud-zone list (issue #88) is hand-maintained and must be mirrored between frame-ancestors
// (who may embed us) and connect-src (where install REST calls go) — a zone in one but not the other silently
// breaks embedding or REST for that region. The exact set is pinned so removing a zone from BOTH is caught too.
const csp = buildCsp(['\'sha256-test\''])

const EXPECTED_TLDS = [
  'by', 'cn', 'co', 'com', 'com.br', 'com.tr', 'de', 'es', 'eu', 'fr', 'id',
  'in', 'it', 'jp', 'kz', 'mx', 'net', 'pl', 'ru', 'ua', 'uk', 'vn'
].sort()

/** Sorted bitrix24.* TLDs of a directive — NOT de-duplicated, so a duplicate makes the list longer and fails. */
function bitrixTlds(directive: string): string[] {
  const value = csp.match(new RegExp(`${directive} ([^;]*)`))?.[1] ?? ''
  return [...value.matchAll(/\*\.bitrix24\.([a-z.]+)/g)].map(m => m[1]!).sort()
}

describe('CSP Bitrix24 domains (#88)', () => {
  it('frame-ancestors lists exactly the expected Bitrix24 zones (incl. .net)', () => {
    expect(bitrixTlds('frame-ancestors')).toEqual(EXPECTED_TLDS)
  })
  it('connect-src mirrors the same set — no drift, no duplicates', () => {
    expect(bitrixTlds('connect-src')).toEqual(EXPECTED_TLDS)
    expect([...BITRIX24_ZONES].sort()).toEqual(EXPECTED_TLDS)
  })
})

describe('CSP hardening directives (#169)', () => {
  it('restricts form submissions to the site itself (form-action \'self\')', () => {
    expect(csp).toContain('form-action \'self\'')
  })
  it('keeps the baseline lockdown directives', () => {
    expect(csp).toContain('object-src \'none\'')
    expect(csp).toContain('base-uri \'self\'')
    expect(csp).toContain('default-src \'self\'')
  })
  it('never allows inline scripts wholesale — only hashes', () => {
    expect(CSP_TEMPLATE).toMatch(/script-src 'self' __CSP_SCRIPT_HASHES__ /)
    expect(csp.match(/script-src [^;]*/)?.[0]).not.toContain('unsafe-inline')
    expect(csp).toContain('\'sha256-test\'')
  })
  it('without inline scripts: same-origin scripts only, still no unsafe-inline', () => {
    const none = buildCsp([])
    expect(none).toContain('script-src \'self\' mc.yandex.ru;')
    expect(none).not.toContain('__CSP_SCRIPT_HASHES__')
    expect(none).not.toContain('unsafe-inline\' mc.yandex')
  })
})

describe('inline-script hashes', () => {
  it('hashes inline scripts only, unique across pages', () => {
    const page = '<script>a()</script><script src="/x.js"></script><script type="module">b()</script>'
    const h = inlineScriptHashes([page, page])
    expect(h).toHaveLength(2)
    // sha256("a()") in base64
    expect(h).toContain('\'sha256-qVpDBgj7bpq5hMAcGp3AOc79J3Y1Z4HvySTwKrWDoy4=\'')
  })
})

describe('security headers (#46)', () => {
  it('sends the baseline headers and no X-Frame-Options (framing is governed by frame-ancestors)', () => {
    expect(SECURITY_HEADERS).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '0',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    })
    expect(Object.keys(SECURITY_HEADERS).map(k => k.toLowerCase())).not.toContain('x-frame-options')
  })
})

describe('CSP allow-list of inline scripts (server/plugins/csp.ts)', () => {
  const h = (body: string) => inlineScriptHashes([`<script>${body}</script>`])[0]!
  const CONFIG = 'window.__NUXT__={};window.__NUXT__.config={public:{siteUrl:""}}'
  const page = (injected: string) => [
    '<html><head><script type="importmap">{"imports":{"#entry":"/_nuxt/Ab_1.js"}}</script>',
    `<script data-hid="theme-init">${THEME_INIT_SCRIPT}</script></head><body><div id="__nuxt">`,
    injected,
    `</div><div id="teleports"></div><script>${CONFIG}</script>`,
    '<script type="application/json" data-nuxt-data="nuxt-app">[1]</script></body></html>'
  ].join('')

  it('allows the known scripts of a page', () => {
    const allowed = allowedInlineScriptHashes(page(''))
    expect(allowed).toContain(h(THEME_INIT_SCRIPT))
    expect(allowed).toContain(h(CONFIG))
    expect(allowed).toContain(h('{"imports":{"#entry":"/_nuxt/Ab_1.js"}}'))
    expect(allowed).toHaveLength(3)
  })
  it('a script injected into the markup gets no hash — the CSP blocks it', () => {
    for (const evil of ['<script>alert(1)</script>', '<script data-src="x">alert(1)</script>', '<script type="module">alert(1)</script>']) {
      const allowed = allowedInlineScriptHashes(page(evil))
      expect(allowed, evil).not.toContain(h('alert(1)'))
      expect(allowed).toHaveLength(3)
    }
  })
  it('a script after the real config (end of body) is not allowed either — it is not the Nuxt config', () => {
    const tail = page('').replace('</body>', '<script>alert(1)</script></body>')
    const allowed = allowedInlineScriptHashes(tail)
    expect(allowed).not.toContain(h('alert(1)'))
    expect(allowed).toContain(h(CONFIG))
  })
  it('an injected fake `window.__NUXT__` before the real one is not allowed (only the last counts)', () => {
    const fake = 'window.__NUXT__={};window.__NUXT__.config={};alert(1)'
    const allowed = allowedInlineScriptHashes(page(`<script>${fake}</script>`))
    expect(allowed).not.toContain(h(fake))
    expect(allowed).toContain(h(CONFIG))
  })
  it('a foreign importmap or a changed theme-init is not allowed', () => {
    const bad = page('').replace('/_nuxt/Ab_1.js', 'https://evil.example/x.js').replace(THEME_INIT_SCRIPT, `${THEME_INIT_SCRIPT}alert(1)`)
    expect(allowedInlineScriptHashes(bad)).toHaveLength(1)
  })
  it('the 404 «back» script copy equals the one in the installed Nuxt', () => {
    const pnpm = join(process.cwd(), 'node_modules/.pnpm')
    const dirs = readdirSync(pnpm).filter(d => d.startsWith('nuxt@'))
    expect(dirs.length).toBeGreaterThan(0)
    for (const d of dirs) {
      const vue = readFileSync(join(pnpm, d, 'node_modules/nuxt/dist/app/components/error-404.vue'), 'utf8')
      expect(vue, d).toContain(NUXT_ERROR_BACK_SCRIPT)
    }
    expect(allowedInlineScriptHashes(`<script>${NUXT_ERROR_BACK_SCRIPT}</script>`)).toEqual([h(NUXT_ERROR_BACK_SCRIPT)])
  })
})
