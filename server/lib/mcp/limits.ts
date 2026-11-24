// Rate-limit helpers of the MCP routes (server/utils/mcp.ts). Counters live in the memory of the ONE server process.

/**
 * Client address for rate limits. Behind nginx-proxy the LAST X-Forwarded-For entry is the one the proxy added
 * (earlier entries are whatever the client sent); without the header — the socket address.
 */
export function clientIp(xff: string | undefined, socket: string | undefined): string {
  const last = xff?.split(',').map(s => s.trim()).filter(Boolean).pop()
  return (last || socket || 'unknown').slice(0, 64)
}

/** Fixed-window per-key counters in process memory; expired ones are swept, never all at once. */
export const hits = new Map<string, { n: number, until: number }>()
const HITS_MAX = 20_000
export function takeHit(key: string, limit: number, windowSec: number, now: number = Date.now()): boolean {
  const h = hits.get(key)
  if (!h || h.until <= now) {
    if (hits.size >= HITS_MAX) {
      for (const [k, v] of hits) if (v.until <= now) hits.delete(k)
      // Still full of live windows: refuse new keys rather than wiping everyone's counters.
      if (hits.size >= HITS_MAX) return false
    }
    hits.set(key, { n: 1, until: now + windowSec * 1000 })
    return true
  }
  return ++h.n <= limit
}
