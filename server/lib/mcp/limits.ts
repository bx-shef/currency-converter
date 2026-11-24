// Rate-limit helpers of the MCP routes (server/utils/mcp.ts). Counters live in the memory of the ONE server process.

/**
 * Client address for rate limits. Behind nginx-proxy the LAST X-Forwarded-For entry is the one the proxy added
 * (earlier entries are whatever the client sent); without the header — the socket address.
 */
export function clientIp(xff: string | undefined, socket: string | undefined): string {
  const last = xff?.split(',').map(s => s.trim()).filter(Boolean).pop()
  return ipBucket((last || socket || 'unknown').slice(0, 64))
}

/** IPv6 → its /64 (one host owns the whole /64, so a per-address limit would be free to dodge); IPv4 as is. */
export function ipBucket(ip: string): string {
  const v = ip.replace(/^::ffff:(?=\d+\.)/i, '')
  if (!v.includes(':')) return v
  const [head = '', tail = ''] = v.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const full = v.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  return `${full.slice(0, 4).map(x => (x || '0').toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/**
 * Fixed-window per-key counters in process memory. A full table drops expired windows first, then the OLDEST
 * ones (Map keeps insertion order) — never all at once, and never refusing everybody's new keys.
 */
export const hits = new Map<string, { n: number, until: number }>()
const HITS_MAX = 20_000
export function takeHit(key: string, limit: number, windowSec: number, now: number = Date.now()): boolean {
  const h = hits.get(key)
  if (!h || h.until <= now) {
    if (hits.size >= HITS_MAX) {
      for (const [k, v] of hits) if (v.until <= now) hits.delete(k)
      for (const k of hits.keys()) {
        if (hits.size < HITS_MAX) break
        hits.delete(k)
      }
    }
    hits.delete(key)
    hits.set(key, { n: 1, until: now + windowSec * 1000 })
    return true
  }
  return ++h.n <= limit
}

/** Over the limit already? Reads the counter without counting this request. */
export function isLimited(key: string, limit: number, now: number = Date.now()): boolean {
  const h = hits.get(key)
  return !!h && h.until > now && h.n >= limit
}
