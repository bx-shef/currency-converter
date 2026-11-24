import { createHmac, timingSafeEqual } from 'node:crypto'
import { domainToASCII } from 'node:url'
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
/**
 * Nonce memory, s. A request signed at T+300 is still in time at T+600 (|Δ| = 300), so the nonce must outlive
 * that second: 2 × skew + 1.
 */
export const MCP_NONCE_TTL = 2 * MCP_TS_SKEW + 1
/** Keys live until revoked; the store still needs a TTL — 10 years. */
const KEY_TTL_SEC = 10 * 365 * 86_400
/** Hosts per member_id: real clones are a handful; the cap bounds signature checks per request. */
export const MAX_HOSTS_PER_MEMBER = 8
/** At the cap, a host whose key has not signed anything for this long gives its slot to a new portal. */
export const HOST_IDLE_EVICT_MS = 30 * 86_400_000
/** Last-use stamps are written at most this often per host (not on every call). */
const USED_STAMP_EVERY_MS = 3600_000

const MEMBER_ID = /^[A-Za-z0-9]{8,64}$/
const NONCE = /^[0-9a-f]{16,64}$/i
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

/**
 * Portal host for key records: punycode, lower case, no port, no trailing dot. `www.` is kept — `company.by` and
 * `www.company.by` are different portals and must not share a record. Null when not a valid host name.
 */
export function normalizeHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const bare = raw.trim().replace(/:\d{1,5}$/, '').replace(/\.$/, '')
  if (!bare || !/^[^\s/\\@:?#]+$/.test(bare)) return null
  const h = domainToASCII(bare.toLowerCase())
  return h && HOST.test(h) ? h : null
}

export const isMemberId = (v: unknown): v is string => typeof v === 'string' && MEMBER_ID.test(v)

const keyName = (member: string, host: string) => `mcpkey:${member}:${host}`
const hostsName = (member: string) => `mcpkeyhosts:${member}`

export interface McpKeyRecord { host: string, key: string }
/** Index entry: host, when its key was issued and when it last signed a request (ms). */
interface HostEntry { h: string, at: number, used: number }

export class McpKeyError extends Error {}

/** Connection keys: 32 random bytes base64url, sealed with ENCRYPTION_KEY and bound to (member_id, host) inside the ciphertext. */
export class McpKeys {
  constructor(
    private readonly store: KvStore,
    private readonly encKey: Buffer,
    private readonly now: () => number = () => Date.now()
  ) {}

  /**
   * New key for this portal (replaces its previous one; other hosts of the same member_id are untouched). Shown once.
   * At MAX_HOSTS_PER_MEMBER the host idle longest (≥ HOST_IDLE_EVICT_MS) is dropped; none idle — McpKeyError.
   */
  async issue(member: string, hostRaw: string): Promise<string> {
    const host = normalizeHost(hostRaw)
    if (!isMemberId(member) || !host) throw new McpKeyError('bad portal identity')
    const key = randomToken(32)
    const now = this.now()
    await withLock(hostsName(member), async () => {
      let hosts = (await this.hosts(member)).filter(e => e.h !== host)
      if (hosts.length >= MAX_HOSTS_PER_MEMBER) {
        const idlest = [...hosts].sort((a, b) => Math.max(a.at, a.used) - Math.max(b.at, b.used))[0]!
        if (now - Math.max(idlest.at, idlest.used) < HOST_IDLE_EVICT_MS) {
          throw new McpKeyError(`На этот member_id уже выданы ключи ${MAX_HOSTS_PER_MEMBER} порталам, и все работали за последние 30 дней. Отзовите ключ на неиспользуемой копии портала.`)
        }
        await this.store.del(keyName(member, idlest.h))
        hosts = hosts.filter(e => e.h !== idlest.h)
      }
      hosts.push({ h: host, at: now, used: 0 })
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
      const rest = (await this.hosts(member)).filter(e => e.h !== host)
      if (rest.length) await this.store.put(hostsName(member), rest, KEY_TTL_SEC)
      else await this.store.del(hostsName(member))
    })
  }

  /** Every readable key of this member_id (one per portal host). */
  async all(member: string): Promise<McpKeyRecord[]> {
    if (!isMemberId(member)) return []
    const out: McpKeyRecord[] = []
    for (const e of await this.hosts(member)) {
      const key = await this.read(member, e.h)
      if (key) out.push({ host: e.h, key })
    }
    return out
  }

  /** Stamp a verified signature: keeps an active portal from being evicted. Written at most hourly. */
  async markUsed(member: string, host: string): Promise<void> {
    const now = this.now()
    await withLock(hostsName(member), async () => {
      const hosts = await this.hosts(member)
      const e = hosts.find(x => x.h === host)
      if (!e || now - e.used < USED_STAMP_EVERY_MS) return
      e.used = now
      await this.store.put(hostsName(member), hosts, KEY_TTL_SEC)
    })
  }

  private async hosts(member: string): Promise<HostEntry[]> {
    const v = await this.store.get<unknown>(hostsName(member))
    if (!Array.isArray(v)) return []
    return v
      .filter((e): e is HostEntry => !!e && typeof e === 'object' && typeof (e as HostEntry).h === 'string'
        && typeof (e as HostEntry).at === 'number' && typeof (e as HostEntry).used === 'number')
      .slice(0, MAX_HOSTS_PER_MEMBER)
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

/**
 * Transport-level rejection: HTTP status per protocol and a reason for the server log. The HTTP route must answer
 * every 401 alike — the reason (unknown member vs bad signature vs host) is not for the caller.
 */
export class McpReject extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(reason)
  }
}

export interface McpHeaders { ts: string, member: string, signature: string }

const byteLength = (raw: Buffer | string) => typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length

/**
 * Protocol check order, steps 1–3: body size, keys of X-Shef-Member, signature over `ts + "." + raw body`
 * (constant time, tried with every key of that member_id), then |now − ts| ≤ 300. Returns the portal host of the
 * matching key and stamps it as used.
 */
export async function checkRequest(keys: McpKeys, h: McpHeaders, raw: Buffer | string, nowSec: number): Promise<string> {
  // Before any key work: up to MAX_HOSTS_PER_MEMBER decryptions and HMACs over the body per request.
  if (byteLength(raw) > MCP_MAX_BODY) throw new McpReject(413, 'too_large')
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
  await keys.markUsed(h.member, host)
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

/** One-time nonce: a repeat within MCP_NONCE_TTL is 409. Atomic in the store (Redis: SET NX EX). */
export async function takeNonce(store: KvStore, memberId: string, nonce: string): Promise<void> {
  if (!await store.putIfAbsent(`mcpnonce:${memberId}:${nonce}`, 1, MCP_NONCE_TTL)) throw new McpReject(409, 'nonce_replay')
}
