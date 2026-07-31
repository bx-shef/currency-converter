import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guards the Bitrix24 cloud-domain allow-list in the CSP (issue #88). The list is
// hand-maintained and must be mirrored between frame-ancestors (who may embed us)
// and connect-src (where install REST calls go) — a domain in one but not the
// other silently breaks either embedding or REST for that region. We pin the exact
// expected set so removing a zone from BOTH directives is also caught, not just drift.
const nginxConf = readFileSync(fileURLToPath(new URL('../nginx.conf', import.meta.url)), 'utf-8')
// Parse the CSP *header value* only — otherwise "frame-ancestors" in the nearby
// explanatory comment would shadow the real directive.
const csp = nginxConf.match(/Content-Security-Policy "([^"]*)"/)?.[1] ?? ''

// International zones from Bitrix24's "Infrastructure and Sub-processors" doc, plus
// the CIS zones it omits (.ru/.by/.kz/.ua/.net, separate hosting). Update
// deliberately when Bitrix24 adds a region — both directives must carry this set.
const EXPECTED_TLDS = [
  'by', 'cn', 'co', 'com', 'com.br', 'com.tr', 'de', 'es', 'eu', 'fr', 'id',
  'in', 'it', 'jp', 'kz', 'mx', 'net', 'pl', 'ru', 'ua', 'uk', 'vn'
].sort()

/** The sorted list of bitrix24.* TLDs in a CSP directive — NOT de-duplicated, so
 *  an accidental duplicate makes the list longer than EXPECTED and fails the match. */
function bitrixTlds(directive: string): string[] {
  const value = csp.match(new RegExp(`${directive} ([^;]*)`))?.[1] ?? ''
  return [...value.matchAll(/\*\.bitrix24\.([a-z.]+)/g)].map(m => m[1]).sort()
}

describe('nginx.conf CSP Bitrix24 domains (#88)', () => {
  it('frame-ancestors lists exactly the expected Bitrix24 zones (incl. .net)', () => {
    expect(bitrixTlds('frame-ancestors')).toEqual(EXPECTED_TLDS)
  })

  it('connect-src mirrors the same set — no drift, no duplicates', () => {
    expect(bitrixTlds('connect-src')).toEqual(EXPECTED_TLDS)
  })
})

describe('nginx.conf CSP hardening directives (#169)', () => {
  // form-action is NOT inherited from default-src: without it an injected form
  // could post anywhere. The app has no forms, so this is defence in depth.
  it('restricts form submissions to the site itself (form-action \'self\')', () => {
    expect(csp).toContain('form-action \'self\'')
  })

  // Directives that must never silently disappear from the policy.
  it('keeps the baseline lockdown directives', () => {
    expect(csp).toContain('object-src \'none\'')
    expect(csp).toContain('base-uri \'self\'')
    expect(csp).toContain('default-src \'self\'')
  })
})
