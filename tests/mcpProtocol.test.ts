import { describe, expect, it } from 'vitest'
import { decrypt, deriveKey, encrypt } from '../server/lib/mcp/crypto'
import { MemoryStore } from '../server/lib/mcp/store'
import {
  checkRequest, HOST_IDLE_EVICT_MS, MAX_HOSTS_PER_MEMBER, MCP_MAX_BODY, MCP_NONCE_TTL, MCP_TS_SKEW, McpKeyError, McpKeys, McpReject,
  mcpSign, normalizeHost, parseCall, takeNonce, type McpHeaders
} from '../server/lib/mcp/protocol'

// Control values of the shef.cowork cloud-app protocol (toolsai-mcp docs/CLOUD_APPS.md, shef-cowork-tools
// docs/cloud-app.md), computed independently with openssl.
const TEST_KEY = 'k9Zr2Qm7Xv4Lp8Wc1Bn6Td3Hs5Jf0AyE'
const TS = '1763200000'
const BODY = '{"tool":"call_create","args":{"dealId":42,"topic":"Обсудить КП"},"who":{"member_id":"a1b2c3d4e5f60718293a4b5c6d7e8f90","user_id":7,"host":"b24.example.com"},"ts":1763200000,"nonce":"00112233445566778899aabbccddeeff"}'
const MEMBER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const NOW = 1763200000
const DAY = 86_400_000

const enc = deriveKey(Buffer.alloc(32, 7), 'test')
const keysWith = (now: () => number = () => NOW * 1000) => {
  const store = new MemoryStore(now)
  return { store, keys: new McpKeys(store, enc, now) }
}

const callBody = (o: { host?: unknown, member?: string, ts?: unknown, nonce?: unknown, userId?: unknown, args?: unknown } = {}) => JSON.stringify({
  tool: 'convert',
  args: 'args' in o ? o.args : { amount: 5000, from: 'USD', to: 'BYN' },
  who: { member_id: o.member ?? MEMBER, user_id: 'userId' in o ? o.userId : 7, host: 'host' in o ? o.host : 'b24.example.com' },
  ts: 'ts' in o ? o.ts : NOW,
  nonce: 'nonce' in o ? o.nonce : '00112233445566778899aabbccddeeff'
})
const headers = (key: string, body: string, ts = TS, member = MEMBER): McpHeaders => ({ ts, member, signature: mcpSign(key, ts, body) })

async function rejects(p: Promise<unknown> | (() => unknown), status: number, reason: string) {
  const run = typeof p === 'function' ? Promise.resolve().then(p) : p
  await expect(run).rejects.toBeInstanceOf(McpReject)
  await expect(run).rejects.toMatchObject({ status, reason })
}

describe('signature control values', () => {
  it('POST body and GET manifest match the protocol document', () => {
    expect(mcpSign(TEST_KEY, TS, BODY)).toBe('46bad632c0c0100157108cdf3d73b78fc1c8d44457e855cba9ef56aec4bdfd11')
    expect(mcpSign(TEST_KEY, TS, '')).toBe('bc1060a03aef22b3f21756df0a9c171f5ba6208db0697e7a19145ed61e5692b7')
  })
})

describe('normalizeHost', () => {
  it('lower-cases, drops port and trailing dot, keeps www.', () => {
    expect(normalizeHost('B24.Example.com:443')).toBe('b24.example.com')
    expect(normalizeHost(' b24.example.com. ')).toBe('b24.example.com')
    // company.by and www.company.by are different portals — never one record.
    expect(normalizeHost('WWW.company.by')).toBe('www.company.by')
    expect(normalizeHost('company.by')).not.toBe(normalizeHost('www.company.by'))
  })
  it('IDN goes to punycode', () => {
    expect(normalizeHost('ПОРТАЛ.бел')).toBe('xn--80awhdgm.xn--90ais')
    expect(normalizeHost('xn--80awhdgm.xn--90ais')).toBe('xn--80awhdgm.xn--90ais')
  })
  it('rejects non-hosts', () => {
    for (const bad of ['', ' ', 'http://x.by', 'a b.by', '-x.by', 'x..by', 'u@x.by', 'x.by/path', 'x.by:443:443', `${'a'.repeat(64)}.by`, 42, null]) {
      expect(normalizeHost(bad), String(bad)).toBeNull()
    }
    expect(normalizeHost(`${'a'.repeat(63)}.by`)).not.toBeNull()
  })
})

describe('crypto', () => {
  it('round-trips and refuses tampering and a truncated tag', () => {
    const packed = encrypt(enc, 'secret')
    expect(decrypt(enc, packed)).toBe('secret')
    const [iv, tag, body] = packed.split('.')
    const flip = Buffer.from(body!, 'base64url')
    flip[0]! ^= 1
    expect(() => decrypt(enc, `${iv}.${tag}.${flip.toString('base64url')}`)).toThrow()
    expect(() => decrypt(enc, `${iv}.${Buffer.from(tag!, 'base64url').subarray(0, 4).toString('base64url')}.${body}`)).toThrow()
    expect(() => decrypt(enc, 'only.two')).toThrow()
  })
})

describe('McpKeys: per (member_id, host)', () => {
  const hostsOf = async (keys: McpKeys) => (await keys.all(MEMBER)).map(r => r.host).sort()

  it('two on-premise clones with one member_id keep separate keys (#243, toolsai-mcp #304)', async () => {
    const { keys } = keysWith()
    const a = await keys.issue(MEMBER, 'crm.alpha.by')
    const b = await keys.issue(MEMBER, 'crm.beta.by')
    expect(a).not.toBe(b)
    expect(await hostsOf(keys)).toEqual(['crm.alpha.by', 'crm.beta.by'])
    // Re-issuing on one clone replaces only its own key.
    const a2 = await keys.issue(MEMBER, 'crm.alpha.by')
    const all = Object.fromEntries((await keys.all(MEMBER)).map(r => [r.host, r.key]))
    expect(all).toEqual({ 'crm.alpha.by': a2, 'crm.beta.by': b })
    // Revoking one clone leaves the other.
    await keys.revoke(MEMBER, 'crm.alpha.by')
    expect(await hostsOf(keys)).toEqual(['crm.beta.by'])
    expect(await keys.has(MEMBER, 'crm.alpha.by')).toBe(false)
  })

  it('revoking the last host clears the index; issuing again works', async () => {
    const { store, keys } = keysWith()
    const k = await keys.issue(MEMBER, 'b24.example.com')
    await keys.revoke(MEMBER, 'b24.example.com')
    expect(await keys.all(MEMBER)).toEqual([])
    expect(await store.get(`mcpkeyhosts:${MEMBER}`)).toBeNull()
    const body = callBody()
    await rejects(checkRequest(keys, headers(k, body), body, NOW), 401, 'unknown_member')
    await keys.issue(MEMBER, 'b24.example.com')
    expect(await hostsOf(keys)).toEqual(['b24.example.com'])
  })

  it('revoke of an unknown host or a bad identity is a no-op', async () => {
    const { keys } = keysWith()
    await keys.issue(MEMBER, 'crm.alpha.by')
    await keys.revoke(MEMBER, 'crm.other.by')
    await keys.revoke('bad', 'crm.alpha.by')
    await keys.revoke(MEMBER, 'http://x')
    expect(await hostsOf(keys)).toEqual(['crm.alpha.by'])
  })

  it('bad identity on issue throws and keeps the existing key', async () => {
    const { keys } = keysWith()
    const k = await keys.issue(MEMBER, 'crm.alpha.by')
    await expect(keys.issue('short', 'crm.alpha.by')).rejects.toBeInstanceOf(McpKeyError)
    await expect(keys.issue(MEMBER, 'http://x')).rejects.toBeInstanceOf(McpKeyError)
    expect(await keys.all(MEMBER)).toEqual([{ host: 'crm.alpha.by', key: k }])
  })

  it('a sealed record copied under another portal name does not read', async () => {
    const { store, keys } = keysWith()
    await keys.issue(MEMBER, 'crm.alpha.by')
    await store.put(`mcpkey:${MEMBER}:crm.beta.by`, await store.get(`mcpkey:${MEMBER}:crm.alpha.by`), 60)
    await store.put(`mcpkeyhosts:${MEMBER}`, [{ h: 'crm.alpha.by', at: 0, used: 0 }, { h: 'crm.beta.by', at: 0, used: 0 }], 60)
    expect(await hostsOf(keys)).toEqual(['crm.alpha.by'])
  })

  it('a record sealed with another ENCRYPTION_KEY does not read', async () => {
    const { store, keys } = keysWith()
    const other = deriveKey(Buffer.alloc(32, 9), 'test')
    await store.put(`mcpkey:${MEMBER}:crm.alpha.by`, encrypt(other, JSON.stringify({ m: MEMBER, h: 'crm.alpha.by', k: 'x'.repeat(43) })), 60)
    await store.put(`mcpkeyhosts:${MEMBER}`, [{ h: 'crm.alpha.by', at: 0, used: 0 }], 60)
    expect(await keys.all(MEMBER)).toEqual([])
  })

  describe('host slots', () => {
    const fill = async (keys: McpKeys) => {
      const out: Record<string, string> = {}
      for (let i = 0; i < MAX_HOSTS_PER_MEMBER; i++) out[`p${i}.example.by`] = await keys.issue(MEMBER, `p${i}.example.by`)
      return out
    }

    it('at the cap, active portals are never evicted', async () => {
      let now = NOW * 1000
      const { keys } = keysWith(() => now)
      await fill(keys)
      now += HOST_IDLE_EVICT_MS - 1
      await expect(keys.issue(MEMBER, 'new.example.by')).rejects.toBeInstanceOf(McpKeyError)
      // Re-issuing an existing host at the cap is a replacement, not a new slot.
      await expect(keys.issue(MEMBER, 'p3.example.by')).resolves.toEqual(expect.any(String))
    })

    it('at the cap, the host idle longest gives its slot; a recently used one stays', async () => {
      let now = NOW * 1000
      const { keys } = keysWith(() => now)
      const k = await fill(keys)
      now += 40 * DAY
      // p0 signs a request — it is in use, so it must survive.
      const body = callBody({ host: 'p0.example.by' })
      await checkRequest(keys, headers(k['p0.example.by']!, body, String(now / 1000)), body, now / 1000)
      await keys.issue(MEMBER, 'new.example.by')
      const hosts = (await keys.all(MEMBER)).map(r => r.host)
      expect(hosts).toContain('p0.example.by')
      expect(hosts).toContain('new.example.by')
      expect(hosts).toHaveLength(MAX_HOSTS_PER_MEMBER)
      expect(hosts).not.toContain('p1.example.by')
    })
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

  it('who.host is normalised the same way (case, port, trailing dot)', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody({ host: 'B24.Example.COM:443' })
    const h = headers(key, body)
    expect(parseCall(body, h, await checkRequest(keys, h, body, NOW)).who.host).toBe('b24.example.com')
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
    await rejects(() => parseCall(body, h, host), 401, 'host_mismatch')
  })

  it('rejects unknown member, foreign key, tampered body, odd signatures', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    await keys.issue(MEMBER, 'crm.beta.by')
    const body = callBody()
    await rejects(checkRequest(keys, headers(key, body, TS, 'ffffffffffffffff'), body, NOW), 401, 'unknown_member')
    await rejects(checkRequest(keys, headers('x'.repeat(43), body), body, NOW), 401, 'bad_signature')
    await rejects(checkRequest(keys, headers(key, body), body.replace('5000', '9000'), NOW), 401, 'bad_signature')
    for (const signature of ['', 'abc', mcpSign(key, TS, body).toUpperCase(), `${mcpSign(key, TS, body)}0`]) {
      await rejects(checkRequest(keys, { ts: TS, member: MEMBER, signature }, body, NOW), 401, 'bad_signature')
    }
  })

  it('time window is ±300 s, inclusive', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody()
    for (const now of [NOW - MCP_TS_SKEW, NOW + MCP_TS_SKEW, NOW + 299]) expect(await checkRequest(keys, headers(key, body), body, now)).toBe('b24.example.com')
    for (const now of [NOW - MCP_TS_SKEW - 1, NOW + MCP_TS_SKEW + 1]) await rejects(checkRequest(keys, headers(key, body), body, now), 401, 'stale_ts')
  })

  it('a validly signed but malformed X-Shef-Ts is stale', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody()
    for (const ts of ['abc', '', '1763200000.5', '-1763200000', '99999999', '1763200000 ']) {
      await rejects(checkRequest(keys, headers(key, body, ts), body, NOW), 401, 'stale_ts')
    }
  })

  it('signature is checked before time: a stale request with a bad signature says bad_signature', async () => {
    const { keys } = keysWith()
    await keys.issue(MEMBER, 'b24.example.com')
    const body = callBody()
    await rejects(checkRequest(keys, headers('x'.repeat(43), body), body, NOW + 10_000), 401, 'bad_signature')
  })

  it('body larger than 64 KB is refused before any key work', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const big = 'x'.repeat(MCP_MAX_BODY + 1)
    await rejects(checkRequest(keys, headers(key, big), big, NOW), 413, 'too_large')
    await rejects(checkRequest(keys, headers(key, big), Buffer.from(big), NOW), 413, 'too_large')
  })

  it('malformed bodies are 400 after a valid signature', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const cases: [string, string][] = [
      ['', 'bad_json'], ['{', 'bad_json'], ['null', 'bad_body'], ['[]', 'bad_body'], ['"x"', 'bad_body'], ['42', 'bad_body'],
      [JSON.stringify({ nonce: 'aa'.repeat(16), who: {}, ts: NOW }), 'bad_body'],
      [JSON.stringify({ tool: 1, nonce: 'aa'.repeat(16), who: {}, ts: NOW }), 'bad_body'],
      [JSON.stringify({ tool: 'convert', nonce: 'aa'.repeat(16), who: 'x', ts: NOW }), 'bad_body']
    ]
    for (const [body, reason] of cases) {
      const h = headers(key, body)
      const host = await checkRequest(keys, h, body, NOW)
      await rejects(() => parseCall(body, h, host), 400, reason)
    }
  })

  it('nonce format, user id and who.host are validated', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    const check = async (o: Parameters<typeof callBody>[0], status: number, reason: string) => {
      const body = callBody(o)
      const h = headers(key, body)
      const host = await checkRequest(keys, h, body, NOW)
      await rejects(() => parseCall(body, h, host), status, reason)
    }
    for (const nonce of ['a'.repeat(15), 'a'.repeat(65), 'zz'.repeat(16), 1234567890, ` ${'a'.repeat(32)}`]) await check({ nonce }, 400, 'bad_body')
    for (const userId of [0, -1, 1.5, '7', null]) await check({ userId }, 400, 'bad_who')
    await check({ host: 'not a host' }, 400, 'bad_who')
    await check({ ts: NOW + 1 }, 401, 'who_mismatch')
    await check({ member: 'ffffffffffffffff' }, 401, 'who_mismatch')
  })

  it('nonce is lower-cased; args fall back to {}', async () => {
    const { keys } = keysWith()
    const key = await keys.issue(MEMBER, 'b24.example.com')
    for (const args of [null, [1], 'x']) {
      const body = callBody({ nonce: 'AA'.repeat(16), args })
      const h = headers(key, body)
      const c = parseCall(body, h, await checkRequest(keys, h, body, NOW))
      expect(c.nonce).toBe('aa'.repeat(16))
      expect(c.args).toEqual({})
    }
  })
})

describe('takeNonce', () => {
  it('a repeated nonce is 409 for 2 × skew + 1 seconds', async () => {
    let now = 0
    const store = new MemoryStore(() => now)
    expect(MCP_NONCE_TTL).toBe(601)
    await takeNonce(store, MEMBER, 'aa'.repeat(16))
    await rejects(takeNonce(store, MEMBER, 'aa'.repeat(16)), 409, 'nonce_replay')
    now = 600_000 // a request signed at T+300 is still in time at T+600 — its nonce must still be remembered
    await rejects(takeNonce(store, MEMBER, 'aa'.repeat(16)), 409, 'nonce_replay')
    now = 601_000
    await expect(takeNonce(store, MEMBER, 'aa'.repeat(16))).resolves.toBeUndefined()
  })

  it('concurrent takes of one nonce: exactly one wins', async () => {
    const store = new MemoryStore()
    const r = await Promise.allSettled([1, 2, 3].map(() => takeNonce(store, MEMBER, 'bb'.repeat(16))))
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('nonces are per member_id', async () => {
    const store = new MemoryStore()
    await takeNonce(store, MEMBER, 'cc'.repeat(16))
    await expect(takeNonce(store, 'b'.repeat(32), 'cc'.repeat(16))).resolves.toBeUndefined()
  })
})
