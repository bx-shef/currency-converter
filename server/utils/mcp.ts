import type { H3Event } from 'h3'
import Redis from 'ioredis'
import { readConfig, type McpConfig } from '../lib/mcp/config'
import { deriveKey } from '../lib/mcp/crypto'
import { NbrbApi } from '../lib/mcp/nbrbApi'
import { LoginError, PortalAuth } from '../lib/mcp/oauth'
import { checkRequest, MCP_MAX_BODY, McpKeyError, McpKeys, McpReject, parseCall, takeNonce, type McpHeaders } from '../lib/mcp/protocol'
import { RedisStore } from '../lib/mcp/redisStore'
import { AdminSessions } from '../lib/mcp/session'
import { MemoryStore, type KvStore } from '../lib/mcp/store'
import { isToolName, MCP_TOOLS, McpTools, toolError } from '../lib/mcp/tools'

// Routes of the shef.cowork tools (docs/MCP.md): signed manifest and call, admin login from the frame, the
// connection key screen. Log: portal, employee, tool, argument NAMES and outcome — never values, keys,
// signatures, tokens or answers.

interface Services { cfg: McpConfig, store: KvStore, keys: McpKeys, tools: McpTools, auth: PortalAuth, sessions: AdminSessions }

let services: Services | null | undefined

/** Services, or null when the server is not configured (secrets missing) — routes answer 503. */
export function useMcp(): Services | null {
  if (services !== undefined) return services
  const r = readConfig(process.env)
  if (!r.ok) {
    console.warn(JSON.stringify({ kind: 'mcp', action: 'config', outcome: 'disabled', missing: r.missing }))
    return (services = null)
  }
  const { cfg } = r
  const store: KvStore = cfg.redisUrl
    ? new RedisStore(new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false }))
    : new MemoryStore()
  services = {
    cfg,
    store,
    keys: new McpKeys(store, deriveKey(cfg.encryptionKey, 'cc-mcp-connection-key')),
    tools: new McpTools(new NbrbApi()),
    auth: new PortalAuth(cfg),
    sessions: new AdminSessions(store, cfg.encryptionKey)
  }
  return services
}

const nowSec = () => Math.floor(Date.now() / 1000)
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ kind: 'mcp', ...o }))

function notConfigured(event: H3Event) {
  setResponseStatus(event, 503)
  return { error: 'not_configured' }
}

/** Every rejection looks the same from outside: the reason (unknown member, signature, host…) is for the log only. */
function reject(event: H3Event, e: McpReject, extra: Record<string, unknown>) {
  log({ ...extra, outcome: 'reject', status: e.status, reason: e.reason })
  setResponseStatus(event, e.status)
  return { error: e.status === 401 ? 'unauthorized' : e.reason }
}

const headersOf = (event: H3Event): McpHeaders => ({
  ts: getRequestHeader(event, 'x-shef-ts') ?? '',
  member: getRequestHeader(event, 'x-shef-member') ?? '',
  signature: (getRequestHeader(event, 'x-shef-signature') ?? '').toLowerCase()
})

/** Fixed-window per-key counter in process memory (one server process). */
const hits = new Map<string, { n: number, until: number }>()
export function takeHit(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.until <= now) {
    if (hits.size > 10_000) hits.clear()
    hits.set(key, { n: 1, until: now + windowSec * 1000 })
    return true
  }
  return ++h.n <= limit
}

/** Body bytes with a declared, bounded Content-Length (read only after the length check). */
async function boundedBody(event: H3Event, max: number): Promise<Buffer> {
  const length = getRequestHeader(event, 'content-length')
  if (length === undefined || !/^\d+$/.test(length)) throw new McpReject(411, 'no_length')
  if (Number(length) > max) throw new McpReject(413, 'too_large')
  const raw = (await readRawBody(event, false)) ?? Buffer.alloc(0)
  if (raw.length > max) throw new McpReject(413, 'too_large')
  return raw
}

/** GET /api/mcp/manifest — signature of `ts + "."`. */
export async function mcpManifest(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const s = useMcp()
  if (!s) return notConfigured(event)
  const h = headersOf(event)
  try {
    const host = await checkRequest(s.keys, h, '', nowSec())
    log({ action: 'manifest', member: h.member, portal: host, outcome: 'ok' })
    return { tools: MCP_TOOLS }
  } catch (e) {
    if (e instanceof McpReject) return reject(event, e, { action: 'manifest', member: h.member.slice(0, 64) })
    throw e
  }
}

/** POST /api/mcp/call — bounded raw body, signature, time, who, nonce, rate limit, tool. */
export async function mcpCall(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const s = useMcp()
  if (!s) return notConfigured(event)
  const h = headersOf(event)
  const base = { action: 'call', member: h.member.slice(0, 64) }
  try {
    const raw = await boundedBody(event, MCP_MAX_BODY)
    const host = await checkRequest(s.keys, h, raw, nowSec())
    const c = parseCall(raw, h, host)
    if (!isToolName(c.tool)) throw new McpReject(404, 'unknown_tool')
    await takeNonce(s.store, c.who.memberId, c.nonce)
    const who = { ...base, portal: host, user: c.who.userId, tool: c.tool, args: Object.keys(c.args).slice(0, 20) }
    if (!takeHit(`call:${c.who.memberId}:${host}:${c.who.userId}`, 60, 60)) {
      log({ ...who, outcome: 'fail', code: 'rate_limited' })
      return toolError('rate_limited', 'Слишком много запросов курсов — подождите минуту')
    }
    const out = await s.tools.run(c)
    log({ ...who, outcome: out.isError ? 'fail' : 'ok', ...(out._meta ? { code: out._meta.code } : {}) })
    return out
  } catch (e) {
    if (e instanceof McpReject) return reject(event, e, base)
    throw e
  }
}

const bearerOf = (event: H3Event) => /^Bearer (\S+)$/.exec(getRequestHeader(event, 'authorization') ?? '')?.[1]

/** POST /api/app/session — `{ refresh }` from the frame → Bearer for the key screen. */
export async function appSession(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const s = useMcp()
  if (!s) return notConfigured(event)
  // JSON only with a bounded length — before the rate counter, so a cross-site form can't burn an office's limit.
  if (!(getRequestHeader(event, 'content-type') ?? '').startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'Нужен JSON' })
  let raw: Buffer
  try {
    raw = await boundedBody(event, 4096)
  } catch (e) {
    if (e instanceof McpReject) throw createError({ statusCode: e.status, statusMessage: 'Неверный запрос' })
    throw e
  }
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!takeHit(`login:${ip}`, 20, 60)) throw createError({ statusCode: 429, statusMessage: 'Слишком много входов — подождите минуту' })
  let refresh: unknown
  try {
    refresh = (JSON.parse(raw.toString('utf8')) as { refresh?: unknown })?.refresh
  } catch {
    refresh = undefined
  }
  try {
    const login = await s.auth.frameLogin(refresh)
    const { token, session } = await s.sessions.create(login)
    log({ action: 'login', member: session.memberId, portal: session.host, user: session.userId, admin: session.admin, outcome: 'ok' })
    return { token, admin: session.admin, url: s.cfg.publicUrl }
  } catch (e) {
    if (e instanceof LoginError) {
      log({ action: 'login', outcome: 'fail', code: e.code })
      throw createError({ statusCode: e.status, statusMessage: e.message })
    }
    throw e
  }
}

/**
 * Key screen: session + `user.admin` asked again (rights may have been taken away while the page is open).
 * The key goes out only in the answer to «issue», once.
 */
export async function mcpKeyRoute(event: H3Event, action: 'status' | 'issue' | 'revoke') {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const s = useMcp()
  if (!s) return notConfigured(event)
  const sess = await s.sessions.get(bearerOf(event))
  if (!sess) throw createError({ statusCode: 401, statusMessage: 'Сессия истекла — откройте приложение заново' })
  const line = (outcome: string) => log({ action: `key-${action}`, member: sess.memberId, portal: sess.host, user: sess.userId, outcome })
  if (!await s.auth.isAdmin(sess.endpoint, sess.access)) {
    line('forbidden')
    throw createError({ statusCode: 403, statusMessage: 'Ключ для shef.cowork создаёт и отзывает администратор портала' })
  }
  const url = s.cfg.publicUrl
  if (action === 'issue') {
    const replaced = await s.keys.has(sess.memberId, sess.host)
    try {
      const key = await s.keys.issue(sess.memberId, sess.host)
      line(replaced ? 'ok_replaced' : 'ok')
      return { exists: true, url, key }
    } catch (e) {
      if (e instanceof McpKeyError) {
        line('refused')
        throw createError({ statusCode: 409, statusMessage: e.message })
      }
      throw e
    }
  }
  if (action === 'revoke') await s.keys.revoke(sess.memberId, sess.host)
  line('ok')
  return { exists: action === 'revoke' ? false : await s.keys.has(sess.memberId, sess.host), url }
}
