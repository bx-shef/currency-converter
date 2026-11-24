import { createHmac, timingSafeEqual } from 'node:crypto'
import { decrypt, encrypt, randomToken } from './crypto'
import { withLock, type KvStore } from './store'

// shef.cowork cloud-app protocol (bx-shef/toolsai-mcp docs/CLOUD_APPS.md; public copy — bx-shef/shef-cowork-tools
// docs/cloud-app.md): connection key per portal, request signature, time window, one-time nonce.
//
// Keys are stored per (member_id, portal host), NOT per member_id alone: member_id is not unique across all
// Bitrix24 installs — on-premise portals cloned from one image share it (toolsai-mcp #243, #304). Keyed by
// member_id only, issuing a key on one clone would silently wipe the other's. The protocol identifies the
// portal by X-Shef-Member only, so a request is checked against every key of that member_id (constant-time
// each); the matching record's host must then equal `who.host` from the signed body.

export const MCP_MAX_BODY = 64 * 1024
export const MCP_TS_SKEW = 300
export const MCP_NONCE_TTL = 600
/** Keys live until revoked; the store still needs a TTL — 10 years. */
const KEY_TTL_SEC = 10 * 365 * 86_400
/** Hosts per member_id: real clones are a handful; the cap bounds signature checks per request. */
export const MAX_HOSTS_PER_MEMBER = 8

const MEMBER_ID = /^[A-Za-z0-9]{8,64}$/
const NONCE = /^[0-9a-f]{16,64}$/i
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

/** Portal host for key records: lower case, no port, no leading `www.`. Null when not a valid host name. */
export function normalizeHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let h = raw.trim().toLowerCase()
  h = h.replace(/:\d{1,5}$/, '').replace(/\.$/, '')
  if (h.startsWith('www.')) h = h.slice(4)
  return HOST.test(h) ? h : null
}

export const isMemberId = (v: unknown): v is string => typeof v === 'string' && MEMBER_ID.test(v)

const keyName = (member: string, host: string) => `mcpkey:${member}:${host}`
const hostsName = (member: string) => `mcpkeyhosts:${member}`

export interface McpKeyRecord { host: string, key: string }

/** Connection keys: 32 random bytes base64url, sealed with ENCRYPTION_KEY and bound to (member_id, host) inside the ciphertext. */
export class McpKeys {
  constructor(private readonly store: KvStore, private readonly encKey: Buffer) {}

  /** New key for this portal (replaces its previous one; other hosts of the same member_id are untouched). Shown once. */
  async issue(member: string, hostRaw: string): Promise<string> {
    const host = normalizeHost(hostRaw)
    if (!isMemberId(member) || !host) throw new Error('bad portal identity')
    const key = randomToken(32)
    await withLock(hostsName(member), async () => {
      const hosts = await this.hosts(member)
      if (!hosts.includes(host)) {
        if (hosts.length >= MAX_HOSTS_PER_MEMBER) throw new Error('too many portals for one member_id')
        hosts.push(host)
      }
      await this.store.put(keyName(member, host), encrypt(this.encKey, JSON.stringify({ m: member, h: host, k: key })), KEY_TTL_SEC)
      await this.store.put(hostsName(member), hosts, KEY_TTL_SEC)
    })
    return key
  }

  async has(member: string, hostRaw: string): Promise<boolean> {
    const host = normalizeHost(hostRaw)
    return !!host && (await this.read(member, host)) !== null
  }

  async revoke(member: string, hostRaw: string): Promise<void> {
    const host = normalizeHost(hostRaw)
    if (!isMemberId(member) || !host) return
    await withLock(hostsName(member), async () => {
      await this.store.del(keyName(member, host))
      const rest = (await this.hosts(member)).filter(h => h !== host)
      if (rest.length) await this.store.put(hostsName(member), rest, KEY_TTL_SEC)
      else await this.store.del(hostsName(member))
    })
  }

  /** Every readable key of this member_id (one per portal host). */
  async all(member: string): Promise<McpKeyRecord[]> {
    if (!isMemberId(member)) return []
    const out: McpKeyRecord[] = []
    for (const host of await this.hosts(member)) {
      const key = await this.read(member, host)
      if (key) out.push({ host, key })
    }
    return out
  }

  private async hosts(member: string): Promise<string[]> {
    const v = await this.store.get<unknown>(hostsName(member))
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string').slice(0, MAX_HOSTS_PER_MEMBER) : []
  }

  /** Key or null; a record moved under another portal's name does not decrypt to a match. */
  private async read(member: string, host: string): Promise<string | null> {
    if (!isMemberId(member)) return null
    const packed = await this.store.get<string>(keyName(member, host))
    if (!packed) return null
    try {
      const o = JSON.parse(decrypt(this.encKey, packed)) as { m?: unknown, h?: unknown, k?: unknown }
      return o.m === member && o.h === host && typeof o.k === 'string' ? o.k : null
    } catch { return null }
  }
}

export const mcpSign = (key: string, ts: string, raw: Buffer | string) =>
  createHmac('sha256', key).update(`${ts}.`).update(raw).digest('hex')

function signatureMatches(key: string, ts: string, raw: Buffer | string, signature: string): boolean {
  const want = Buffer.from(mcpSign(key, ts, raw))
  const got = Buffer.from(signature)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Transport-level rejection: HTTP status per protocol and a reason for the log (never shown to the model). */
export class McpReject extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(reason)
  }
}

export interface McpHeaders { ts: string, member: string, signature: string }

/**
 * Protocol check order, steps 1–3: keys of X-Shef-Member, signature over `ts + "." + raw body` (constant time,
 * tried with every key of that member_id), then |now − ts| ≤ 300. Returns the portal host of the matching key.
 */
export async function checkRequest(keys: McpKeys, h: McpHeaders, raw: Buffer | string, nowSec: number): Promise<string> {
  if (!isMemberId(h.member)) throw new McpReject(401, 'unknown_member')
  const records = await keys.all(h.member)
  if (!records.length) throw new McpReject(401, 'unknown_member')
  // Try every key without early exit, so timing does not reveal which record matched.
  let host: string | null = null
  for (const r of records) {
    if (signatureMatches(r.key, h.ts, raw, h.signature) && host === null) host = r.host
  }
  if (host === null) throw new McpReject(401, 'bad_signature')
  if (!/^\d{9,12}$/.test(h.ts) || Math.abs(nowSec - Number(h.ts)) > MCP_TS_SKEW) throw new McpReject(401, 'stale_ts')
  return host
}

export interface McpWho { memberId: string, userId: number, host: string }
export interface McpCall { tool: string, args: Record<string, unknown>, who: McpWho, nonce: string }

/**
 * Call body, parsed only after the signature check: `ts` equals X-Shef-Ts, `who.member_id` equals X-Shef-Member,
 * `who.host` equals the host of the key that signed the request.
 */
export function parseCall(raw: Buffer | string, h: McpHeaders, keyHost: string): McpCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped wire JSON, every field is checked below
  let b: any
  try {
    b = JSON.parse(raw.toString())
  } catch {
    throw new McpReject(400, 'bad_json')
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new McpReject(400, 'bad_body')
  if (typeof b.tool !== 'string' || typeof b.nonce !== 'string' || !NONCE.test(b.nonce)) throw new McpReject(400, 'bad_body')
  const who = b.who
  if (!who || typeof who !== 'object') throw new McpReject(400, 'bad_body')
  if (String(b.ts) !== h.ts || who.member_id !== h.member) throw new McpReject(401, 'who_mismatch')
  const host = normalizeHost(who.host)
  if (host === null) throw new McpReject(400, 'bad_who')
  if (host !== keyHost) throw new McpReject(401, 'host_mismatch')
  const userId = who.user_id
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId < 1) throw new McpReject(400, 'bad_who')
  const args = b.args && typeof b.args === 'object' && !Array.isArray(b.args) ? b.args as Record<string, unknown> : {}
  return { tool: b.tool, args, who: { memberId: h.member, userId, host }, nonce: b.nonce.toLowerCase() }
}

/** One-time nonce: a repeat within MCP_NONCE_TTL is 409. */
export async function takeNonce(store: KvStore, memberId: string, nonce: string): Promise<void> {
  const key = `mcpnonce:${memberId}:${nonce}`
  await withLock(key, async () => {
    if (await store.get(key)) throw new McpReject(409, 'nonce_replay')
    await store.put(key, 1, MCP_NONCE_TTL)
  })
}
