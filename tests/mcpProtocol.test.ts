import { describe, expect, it } from 'vitest'
import { deriveKey, encrypt } from '../server/lib/mcp/crypto'
import { MemoryStore } from '../server/lib/mcp/store'
import { checkRequest, MAX_HOSTS_PER_MEMBER, McpKeys, McpReject, mcpSign, normalizeHost, parseCall, takeNonce, type McpHeaders } from '../server/lib/mcp/protocol'

// Control values of the shef.cowork cloud-app protocol (toolsai-mcp docs/CLOUD_APPS.md, shef-cowork-tools
// docs/cloud-app.md), computed independently with openssl.
const TEST_KEY = 'k9Zr2Qm7Xv4Lp8Wc1Bn6Td3Hs5Jf0AyE'
const TS = '1763200000'
const BODY = '{"tool":"call_create","args":{"dealId":42,"topic":"Обсудить КП"},"who":{"member_id":"a1b2c3d4e5f60718293a4b5c6d7e8f90","user_id":7,"host":"b24.example.com"},"ts":1763200000,"nonce":"00112233445566778899aabbccddeeff"}'
const MEMBER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const NOW = 1763200000

const enc = deriveKey(Buffer.alloc(32, 7), 'test')
const keysWith = () => {
  const store = new MemoryStore()
  return { store, keys: new McpKeys(store, enc) }
}

const callBody = (o: { host?: string, member?: string, ts?: number, nonce?: string, tool?: string } = {}) => JSON.stringify({
  tool: o.tool ?? 'convert',
  args: { amount: 5000, from: 'USD', to: 'BYN' },
  who: { member_id: o.member ?? MEMBER, user_id: 7, host: o.host ?? 'b24.example.com' },
  ts: o.ts ?? NOW,
  nonce: o.nonce ?? '00112233445566778899aabbccddeeff'
})
const headers = (key: string, body: string, ts = TS, member = MEMBER): McpHeaders => ({ ts, member, signature: mcpSign(key, ts, body) })

describe('signature control values', () => {
  it('POST body and GET manifest match the protocol document', () => {
    expect(mcpSign(TEST_KEY, TS, BODY)).toBe('46bad632c0c0100157108cdf3d73b78fc1c8d44457e855cba9ef56aec4bdfd11')
    expect(mcpSign(TEST_KEY, TS, '')).toBe('bc1060a03aef22b3f21756df0a9c171f5ba6208db0697e7a19145ed61e5692b7')
  })
})

describe('normalizeHost', () => {
  it('lower-cases, drops port, trailing dot and www.', () => {
    expect(normalizeHost('WWW.B24.Example.com:443')).toBe('b24.example.com')
    expect(normalizeHost('b24.example.com.')).toBe('b24.example.com')
  })
  it('rejects non-hosts', () => {
    for (const bad of ['', 'http://x.by', 'a b.by', '-x.by', 'x..by', 42, null]) expect(normalizeHost(bad)).toBeNull()
  })
})

describe('McpKeys: per (member_id, host)', () => {
  it('two on-premise clones with one member_id keep separate keys (#243, toolsai-mcp #304)', async () => {
    const { keys } = keysWith()
    const a = await keys.issue(MEMBER, 'crm.alpha.by')
    const b = await keys.issue(MEMBER, 'crm.beta.by')
    expect(a).not.toBe(b)
    expect(await keys.all(MEMBER)).toEqual([{ host: 'crm.alpha.by', key: a }, { host: 'crm.beta.by', key: b }])
    // Re-issuing on one clone replaces only its own key.
    const a2 = await keys.issue(MEMBER, 'crm.alpha.by')
    expect(await keys.all(MEMBER)).toEqual([{ host: 'crm.alpha.by', key: a2 }, { host: 'crm.beta.by', key: b }])
    // Revoking one clone leaves the other.
    await keys.revoke(MEMBER, 'crm.alpha.by')
    expect(await keys.all(MEMBER)).toEqual([{ host: 'crm.beta.by', key: b }])
    expect(await keys.has(MEMBER, 'crm.alpha.by')).toBe(false)
  })

  it('a sealed record copied under another portal name does not read', async () => {
    const { store, keys } = keysWith()
    await keys.issue(MEMBER, 'crm.alpha.by')
    await store.put(`mcpkey:${MEMBER}:crm.beta.by`, await store.get(`mcpkey:${MEMBER}:crm.alpha.by`), 60)
    await store.put(`mcpkeyhosts:${MEMBER}`, ['crm.alpha.by', 'crm.beta.by'], 60)
    expect((await keys.all(MEMBER)).map(r => r.host)).toEqual(['crm.alpha.by'])
  })

  it('a record sealed with another ENCRYPTION_KEY does not read', async () => {
    const { store, keys } = keysWith()
    const other = deriveKey(Buffer.alloc(32, 9), 'test')
    await store.put(`mcpkey:${MEMBER}:crm.alpha.by`, encrypt(other, JSON.stringify({ m: MEMBER, h: 'crm.alpha.by', k: 'x'.repeat(43) })), 60)
    await store.put(`mcpkeyhosts:${MEMBER}`, ['crm.alpha.by'], 60)
    expect(await keys.all(MEMBER)).toEqual([])
  })

  it('caps portals per member_id', async () => {
    const { keys } = keysWith()
    for (let i = 0; i < MAX_HOSTS_PER_MEMBER; i++) await keys.issue(MEMBER, `p${i}.example.by`)
    await expect(keys.issue(MEMBER, 'one-more.example.by')).rejects.toThrow()
  })
})

describe('checkRequest + parseCall', () => {
  it('accepts a correctly signed call and returns the host of the signing key', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody()
    const h = headers(key, body)
    const host = await checkRequest(keys, h, body, NOW)
    expect(host).toBe('b24.example.com')
    expect(parseCall(body, h, host).who).toEqual({ memberId: MEMBER, userId: 7, host: 'b24.example.com' })
  })

  it('finds the right clone among several keys of one member_id', async () => {
    const { keys } = keysWith()
    await keys.issue(MEMBER, 'crm.alpha.by')
    const beta = await keys.issue(MEMBER, 'crm.beta.by')
    const body = callBody({ host: 'crm.beta.by' })
    expect(await checkRequest(keys, headers(beta, body), body, NOW)).toBe('crm.beta.by')
  })

  it('clone A signing a body that claims clone B is rejected (host_mismatch)', async () => {
    const { keys } = keysWith()
    const alpha = await keys.issue(MEMBER, 'crm.alpha.by')
    await keys.issue(MEMBER, 'crm.beta.by')
    const body = callBody({ host: 'crm.beta.by' })
    const h = headers(alpha, body)
    const host = await checkRequest(keys, h, body, NOW)
    expect(host).toBe('crm.alpha.by')
    expect(() => parseCall(body, h, host)).toThrow(expect.objectContaining({ status: 401, reason: 'host_mismatch' }))
  })

  const rejects = async (p: Promise<unknown>, status: number, reason: string) => {
    await expect(p).rejects.toBeInstanceOf(McpReject)
    await expect(p).rejects.toMatchObject({ status, reason })
  }

  it('rejects unknown member, wrong key, tampered body, stale time', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody()
    await rejects(checkRequest(keys, headers(key, body, TS, 'ffffffffffffffff'), body, NOW), 401, 'unknown_member')
    await rejects(checkRequest(keys, headers('x'.repeat(43), body), body, NOW), 401, 'bad_signature')
    await rejects(checkRequest(keys, headers(key, body), body.replace('5000', '9000'), NOW), 401, 'bad_signature')
    await rejects(checkRequest(keys, headers(key, body), body, NOW + 301), 401, 'stale_ts')
    expect(await checkRequest(keys, headers(key, body), body, NOW + 300)).toBe('b24.example.com')
  })

  it('body ts and member must equal the headers', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody({ ts: NOW + 1 })
    const h = headers(key, body)
    const host = await checkRequest(keys, h, body, NOW)
    expect(() => parseCall(body, h, host)).toThrow(expect.objectContaining({ reason: 'who_mismatch' }))
  })
})

describe('takeNonce', () => {
  it('a repeated nonce is 409 within 10 minutes', async () => {
    let now = 0
    const store = new MemoryStore(() => now)
    await takeNonce(store, MEMBER, 'aa'.repeat(16))
    await expect(takeNonce(store, MEMBER, 'aa'.repeat(16))).rejects.toMatchObject({ status: 409 })
    now = 601_000
    await expect(takeNonce(store, MEMBER, 'aa'.repeat(16))).resolves.toBeUndefined()
  })
})
