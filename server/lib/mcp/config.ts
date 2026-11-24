// Server settings for the shef.cowork tools (docs/MCP.md). Read from the environment; any of the three secrets
// missing → the tools and the key screen answer "not configured" and the site keeps working.

export interface McpConfig {
  /** Public https origin of this app, e.g. https://currency.example.by (shown to the portal admin). */
  publicUrl: string
  b24ClientId: string
  b24ClientSecret: string
  /** 32-byte master key for sealing connection keys and session tokens. */
  encryptionKey: Buffer
  /** Bitrix24 OAuth servers to exchange a frame refresh token at (cloud and on-premise). */
  oauthServers: string[]
  /** redis://… ; empty → in-memory store (dev, tests, single run). */
  redisUrl: string
  /**
   * The server itself is local (PUBLIC_URL on localhost — tests, development): only then http and localhost are
   * accepted for the OAuth server and the portal. A production https PUBLIC_URL never enables it.
   */
  allowLocal: boolean
}

export type ConfigResult = { ok: true, cfg: McpConfig } | { ok: false, missing: string[] }

const DEFAULT_OAUTH = ['https://oauth.bitrix.info', 'https://oauth.bitrix24.tech']

const LOCAL = new Set(['localhost', '127.0.0.1'])

function httpsOrigin(name: string, v: string, allowLocal = false): string {
  const u = new URL(v)
  const local = allowLocal && LOCAL.has(u.hostname) && u.protocol === 'http:'
  if ((u.protocol !== 'https:' && !local) || u.username || u.password || u.search || u.hash) throw new Error(`${name}: нужен адрес https без логина и параметров`)
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** ENCRYPTION_KEY: base64 or hex of at least 32 bytes. */
export function parseEncryptionKey(v: string): Buffer | null {
  const s = v.trim()
  const buf = /^[0-9a-f]{64,}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64')
  return buf.length >= 32 ? buf.subarray(0, 32) : null
}

export function readConfig(env: Record<string, string | undefined>): ConfigResult {
  const missing = ['PUBLIC_URL', 'B24_CLIENT_ID', 'B24_CLIENT_SECRET', 'ENCRYPTION_KEY'].filter(k => !env[k]?.trim())
  if (missing.length) return { ok: false, missing }
  const key = parseEncryptionKey(env.ENCRYPTION_KEY!)
  if (!key) throw new Error('ENCRYPTION_KEY: нужно не меньше 32 байт в base64 или hex (openssl rand -base64 32)')
  const allowLocal = LOCAL.has(new URL(env.PUBLIC_URL!.trim()).hostname)
  const servers = (env.B24_OAUTH_SERVERS?.trim() ? env.B24_OAUTH_SERVERS.split(',') : DEFAULT_OAUTH).map(s => httpsOrigin('B24_OAUTH_SERVERS', s.trim(), allowLocal))
  return {
    ok: true,
    cfg: {
      publicUrl: httpsOrigin('PUBLIC_URL', env.PUBLIC_URL!.trim(), allowLocal),
      b24ClientId: env.B24_CLIENT_ID!.trim(),
      b24ClientSecret: env.B24_CLIENT_SECRET!.trim(),
      encryptionKey: key,
      oauthServers: servers,
      redisUrl: env.REDIS_URL?.trim() ?? '',
      allowLocal
    }
  }
}
