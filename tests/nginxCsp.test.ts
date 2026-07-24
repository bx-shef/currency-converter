import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guards the Bitrix24 cloud-domain allow-list in the CSP (issue #88). The list is
// hand-maintained and must be mirrored between frame-ancestors (who may embed us)
// and connect-src (where install REST calls go) — a domain added to one but not
// the other silently breaks either embedding or REST for that region.
const nginxConf = readFileSync(fileURLToPath(new URL('../nginx.conf', import.meta.url)), 'utf-8')
// Parse the CSP *header value* only — otherwise "frame-ancestors" in the nearby
// explanatory comment would shadow the real directive.
const csp = nginxConf.match(/Content-Security-Policy "([^"]*)"/)?.[1] ?? ''

/** The sorted set of bitrix24.* TLDs listed in a single CSP directive. */
function bitrixTlds(directive: string): string[] {
  const value = csp.match(new RegExp(`${directive} ([^;]*)`))?.[1] ?? ''
  return [...value.matchAll(/\*\.bitrix24\.([a-z.]+)/g)].map(m => m[1]).sort()
}

describe('nginx.conf CSP Bitrix24 domains (#88)', () => {
  it('includes bitrix24.net in both frame-ancestors and connect-src', () => {
    expect(bitrixTlds('frame-ancestors')).toContain('net')
    expect(bitrixTlds('connect-src')).toContain('net')
  })

  it('frame-ancestors and connect-src carry the SAME bitrix24 TLD set (no drift)', () => {
    const frame = bitrixTlds('frame-ancestors')
    expect(frame.length).toBeGreaterThan(10) // sanity: the list was actually parsed
    expect(frame).toEqual(bitrixTlds('connect-src'))
  })
})
