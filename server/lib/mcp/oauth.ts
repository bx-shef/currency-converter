import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

// Portal admin login from the app frame (pattern of bx-shef/use-bitrix24-sync, server/lib/b24.ts). The frame's
// refresh_token is exchanged at the Bitrix24 OAuth server with OUR client_secret, so member_id and the portal
// REST address come from the OAuth server's answer — never from the browser (a forged member_id or domain
// would let one portal poison another's key record, cf. ai-price-import #162).
// Docs (bitrix-tools/b24-rest-docs): settings/oauth/index.md (token answer: client_endpoint, member_id),
// settings/oauth/auto-renewal.md (grant_type=refresh_token), api-reference/common/users/user-admin.md.

export type Fetch = typeof fetch
export type Resolve = (host: string) => Promise<string[]>

export interface PortalAdminLogin {
  memberId: string
  /** Portal host from client_endpoint (lower case). */
  host: string
  userId: number
  admin: boolean
  /** REST endpoint `https://portal/rest/` and an access token for re-checking `user.admin`. */
  endpoint: string
  access: string
  /** Access token lifetime, s. */
  expiresIn: number
}

export class LoginError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

const AUTH_ERRORS = new Set(['invalid_token', 'NO_AUTH_FOUND', 'invalid_grant', 'expired_token', 'invalid_client'])
const TIMEOUT_MS = 15_000
/** Answers of the OAuth server and the portal are small; a portal (on-premise: its owner) could stream megabytes. */
export const MAX_ANSWER_BYTES = 256 * 1024

/** JSON body read with a byte cap; over the cap or not JSON → {}. */
export async function readJsonCapped(res: Response, max: number = MAX_ANSWER_BYTES): Promise<Record<string, unknown>> {
  const reader = res.body?.getReader()
  if (!reader) return {}
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>
    try {
      r = await reader.read()
    } catch {
      return {}
    }
    const { done, value } = r
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return {}
    }
    chunks.push(value)
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

const PRIVATE = new BlockList()
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) PRIVATE.addSubnet(net, bits, 'ipv4')
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2002::', 16]] as const) PRIVATE.addSubnet(net, bits, 'ipv6')

export function isPrivateIp(ip: string): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1]
  if (v4) return PRIVATE.check(v4, 'ipv4')
  return isIP(ip) === 6 ? PRIVATE.check(ip, 'ipv6') : PRIVATE.check(ip, 'ipv4')
}

export const dnsResolve: Resolve = async host => (await lookup(host, { all: true })).map(a => a.address)

const LOCAL = new Set(['localhost', '127.0.0.1'])

/** `client_endpoint` → `https://portal/rest/`: https, a host name (not an IP), no login or query; localhost only for a local server. */
export function restEndpoint(value: unknown, allowLocal = false): string | null {
  if (typeof value !== 'string') return null
  try {
    const u = new URL(value)
    if (allowLocal && LOCAL.has(u.hostname)) return `${u.origin}${u.pathname.replace(/\/*$/, '/')}`
    // https on the standard port only: a portal-chosen port would let the address point at any service.
    if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash) return null
    if (isIP(u.hostname.replace(/^\[|\]$/g, '')) || !u.hostname.includes('.')) return null
    return `${u.origin}${u.pathname.replace(/\/*$/, '/')}`
  } catch {
    return null
  }
}

const REFRESH = /^[\w.-]{8,512}$/

export class PortalAuth {
  constructor(
    private readonly cfg: { b24ClientId: string, b24ClientSecret: string, oauthServers: string[], allowLocal?: boolean },
    private readonly fetchFn: Fetch = fetch,
    private readonly resolve: Resolve = dnsResolve
  ) {}

  /**
   * refresh_token of the frame → who is logged in, from the OAuth server's answer. The frame does not say which
   * OAuth server issued the token, so servers are tried in order (a foreign server answers invalid_grant without
   * spending the token). Throws LoginError.
   */
  async frameLogin(refresh: unknown): Promise<PortalAdminLogin> {
    if (typeof refresh !== 'string' || !REFRESH.test(refresh)) throw new LoginError(400, 'no_refresh', 'Нет данных входа из Битрикс24 — откройте приложение в портале')
    let body: Record<string, unknown> | null = null
    for (const server of this.cfg.oauthServers) {
      try {
        body = await this.tokenRequest(server, refresh)
        break
      } catch (e) {
        if (!(e instanceof LoginError) || e.code !== 'invalid_grant') throw e
      }
    }
    if (!body) throw new LoginError(401, 'invalid_grant', 'Битрикс24 не подтвердил вход — откройте приложение заново')
    const endpoint = restEndpoint(body.client_endpoint, this.cfg.allowLocal)
    const memberId = String(body.member_id ?? '')
    const access = typeof body.access_token === 'string' ? body.access_token : ''
    if (!endpoint || !/^[a-z0-9]{8,64}$/i.test(memberId) || !access) throw new LoginError(502, 'bad_token_response', 'Битрикс24 ответил без адреса портала — попробуйте ещё раз')
    const host = new URL(endpoint).hostname.toLowerCase()
    await this.assertPublic(host)
    const me = await this.call(endpoint, access, 'user.current') as { ID?: unknown } | null
    const userId = Number(me?.ID)
    if (!Number.isInteger(userId) || userId <= 0) throw new LoginError(502, 'bad_user', 'Битрикс24 не сообщил, кто вошёл — попробуйте ещё раз')
    const admin = await this.isAdmin(endpoint, access)
    const expiresIn = Number(body.expires_in)
    return { memberId, host, userId, admin, endpoint, access, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600 }
  }

  /** `user.admin` right now (rights may have been taken away while the page was open). Errors → false. */
  async isAdmin(endpoint: string, access: string): Promise<boolean> {
    try {
      return (await this.call(endpoint, access, 'user.admin')) === true
    } catch {
      return false
    }
  }

  private async tokenRequest(server: string, refresh: string): Promise<Record<string, unknown>> {
    const u = new URL(`${server}/oauth/token/`)
    u.searchParams.set('grant_type', 'refresh_token')
    u.searchParams.set('client_id', this.cfg.b24ClientId)
    u.searchParams.set('client_secret', this.cfg.b24ClientSecret)
    u.searchParams.set('refresh_token', refresh)
    let res: Response
    try {
      res = await this.fetchFn(u, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new LoginError(502, 'oauth_unreachable', 'Сервер авторизации Битрикс24 не ответил — попробуйте ещё раз')
    }
    const body = await readJsonCapped(res)
    if (!res.ok || typeof body.access_token !== 'string') {
      const code = String(body.error || `http_${res.status}`).slice(0, 64)
      if (code === 'invalid_grant') throw new LoginError(401, 'invalid_grant', 'Битрикс24 не подтвердил вход')
      if (AUTH_ERRORS.has(code)) throw new LoginError(401, code, 'Битрикс24 не подтвердил вход — откройте приложение заново')
      throw new LoginError(502, 'oauth_error', 'Сервер авторизации Битрикс24 ответил ошибкой — попробуйте ещё раз')
    }
    return body
  }

  private async call(endpoint: string, access: string, method: string): Promise<unknown> {
    await this.assertPublic(new URL(endpoint).hostname)
    let res: Response
    try {
      res = await this.fetchFn(`${endpoint}${method}.json`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth: access }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      throw new LoginError(502, 'portal_unreachable', 'Портал Битрикс24 не ответил — попробуйте ещё раз')
    }
    const body = await readJsonCapped(res)
    if (!res.ok || body.error) throw new LoginError(AUTH_ERRORS.has(String(body.error)) ? 401 : 502, String(body.error || `http_${res.status}`).slice(0, 64), 'Портал Битрикс24 ответил ошибкой')
    return body.result
  }

  /** The portal address must not lead into the internal network (it is set by the portal itself). */
  private async assertPublic(host: string): Promise<void> {
    if (this.cfg.allowLocal && LOCAL.has(host)) return
    let addrs: string[]
    try {
      addrs = await this.resolve(host)
    } catch {
      throw new LoginError(502, 'portal_unreachable', `Не удалось найти адрес портала ${host}`)
    }
    if (!addrs.length || addrs.some(isPrivateIp)) throw new LoginError(403, 'portal_private', 'Адрес портала ведёт во внутреннюю сеть — запрещено')
  }
}
