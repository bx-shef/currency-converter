import { describe, expect, it } from 'vitest'
import { BITRIX24_ZONES, buildCsp, CSP_TEMPLATE, inlineScriptHashes, SECURITY_HEADERS } from '../server/lib/security'

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
  it('refuses to build a CSP without hashes (it would block the page)', () => {
    expect(() => buildCsp([])).toThrow()
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
