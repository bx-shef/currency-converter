import { describe, expect, it, vi } from 'vitest'
import { parseEncryptionKey, readConfig } from '../server/lib/mcp/config'
import { clientIp, hits, takeHit } from '../server/lib/mcp/limits'
import { isPrivateIp, LoginError, PortalAuth, readJsonCapped, restEndpoint, type Fetch } from '../server/lib/mcp/oauth'
import { RedisStore, StoreUnavailable, type RedisLike } from '../server/lib/mcp/redisStore'
import { AdminSessions } from '../server/lib/mcp/session'
import { MemoryStore } from '../server/lib/mcp/store'

const KEY_B64 = Buffer.alloc(32, 5).toString('base64')
const ENV = { PUBLIC_URL: 'https://cc.example.by', B24_CLIENT_ID: 'local.app', B24_CLIENT_SECRET: 's3cret', ENCRYPTION_KEY: KEY_B64 }

describe('readConfig', () => {
  it('any secret missing → disabled with the list', () => {
    expect(readConfig({})).toEqual({ ok: false, missing: ['PUBLIC_URL', 'B24_CLIENT_ID', 'B24_CLIENT_SECRET', 'ENCRYPTION_KEY'] })
    expect(readConfig({ ...ENV, B24_CLIENT_SECRET: '  ' })).toEqual({ ok: false, missing: ['B24_CLIENT_SECRET'] })
  })
  it('production: https only, default OAuth servers, no local', () => {
    const r = readConfig(ENV)
    expect(r.ok && r.cfg.allowLocal).toBe(false)
    expect(r.ok && r.cfg.oauthServers).toEqual(['https://oauth.bitrix.info', 'https://oauth.bitrix24.tech'])
    expect(() => readConfig({ ...ENV, PUBLIC_URL: 'http://cc.example.by' })).toThrow()
    expect(() => readConfig({ ...ENV, B24_OAUTH_SERVERS: 'http://127.0.0.1:9' })).toThrow()
  })
  it('local server (tests) may use http on localhost', () => {
    const r = readConfig({ ...ENV, PUBLIC_URL: 'http://127.0.0.1:3000', B24_OAUTH_SERVERS: 'http://127.0.0.1:9' })
    expect(r.ok && r.cfg.allowLocal).toBe(true)
  })
  it('ENCRYPTION_KEY: at least 32 bytes, base64 or hex', () => {
    expect(parseEncryptionKey(KEY_B64)?.length).toBe(32)
    expect(parseEncryptionKey('ab'.repeat(32))?.length).toBe(32)
    expect(parseEncryptionKey('short')).toBeNull()
    expect(() => readConfig({ ...ENV, ENCRYPTION_KEY: 'short' })).toThrow()
  })
})

describe('restEndpoint and private addresses', () => {
  it('https host names only; localhost only for a local server', () => {
    expect(restEndpoint('https://b24.example.by/rest')).toBe('https://b24.example.by/rest/')
    for (const bad of ['http://b24.example.by/rest/', 'https://10.0.0.1/rest/', 'https://u:p@b24.by/rest/', 'https://localhost/rest/', 'https://b24.example.by:8443/rest/', 42]) expect(restEndpoint(bad), String(bad)).toBeNull()
    expect(restEndpoint('https://b24.example.by:443/rest/')).toBe('https://b24.example.by/rest/')
    expect(restEndpoint('http://127.0.0.1:9/rest/', true)).toBe('http://127.0.0.1:9/rest/')
  })
  it('private ranges', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.1', '::1', '::ffff:10.0.0.1', '64:ff9b::a00:1']) expect(isPrivateIp(ip), ip).toBe(true)
    for (const ip of ['93.184.216.34', '2a00:1450::1']) expect(isPrivateIp(ip), ip).toBe(false)
  })
})

/** Fake OAuth server + portal REST. */
function fakeB24(o: { member?: string, endpoint?: string, admin?: boolean, grantOn?: string } = {}) {
  const calls: string[] = []
  const fetchFn: Fetch = async (input, init) => {
    const url = String(input)
    calls.push(url.replace(/client_secret=[^&]+/, 'client_secret=***'))
    if (url.includes('/oauth/token/')) {
      if (o.grantOn && !url.startsWith(o.grantOn)) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({ access_token: 'acc-1', expires_in: 3600, member_id: o.member ?? 'a1b2c3d4e5f60718', client_endpoint: o.endpoint ?? 'https://crm.alpha.by/rest/' })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { auth?: string }
    if (body.auth !== 'acc-1') return Response.json({ error: 'invalid_token' }, { status: 401 })
    if (url.endsWith('user.current.json')) return Response.json({ result: { ID: '7' } })
    if (url.endsWith('user.admin.json')) return Response.json({ result: o.admin ?? true })
    return Response.json({ error: 'ERROR_METHOD_NOT_FOUND' }, { status: 404 })
  }
  return { calls, fetchFn }
}
const CFG = { b24ClientId: 'local.app', b24ClientSecret: 's3cret', oauthServers: ['https://oauth.bitrix.info', 'https://oauth.bitrix24.tech'] }
const publicDns = async () => ['93.184.216.34']

describe('PortalAuth.frameLogin', () => {
  it('member_id and host come from the OAuth server’s answer', async () => {
    const b = fakeB24({ member: 'ffff0000ffff0000', endpoint: 'https://CRM.Beta.by/rest/' })
    const r = await new PortalAuth(CFG, b.fetchFn, publicDns).frameLogin('refresh-token-1')
    expect(r).toMatchObject({ memberId: 'ffff0000ffff0000', host: 'crm.beta.by', userId: 7, admin: true, endpoint: 'https://crm.beta.by/rest/' })
  })
  it('tries the next OAuth server on invalid_grant', async () => {
    const b = fakeB24({ grantOn: 'https://oauth.bitrix24.tech' })
    await new PortalAuth(CFG, b.fetchFn, publicDns).frameLogin('refresh-token-1')
    expect(b.calls.filter(u => u.includes('/oauth/token/')).map(u => new URL(u).origin)).toEqual(['https://oauth.bitrix.info', 'https://oauth.bitrix24.tech'])
  })
  it('non-admin logs in with admin: false', async () => {
    expect((await new PortalAuth(CFG, fakeB24({ admin: false }).fetchFn, publicDns).frameLogin('refresh-token-1')).admin).toBe(false)
  })
  it('refuses: bad refresh, portal in the internal network, non-https endpoint, no grant anywhere', async () => {
    const ok = fakeB24()
    await expect(new PortalAuth(CFG, ok.fetchFn, publicDns).frameLogin('x')).rejects.toMatchObject({ code: 'no_refresh' })
    expect(ok.calls).toEqual([])
    await expect(new PortalAuth(CFG, ok.fetchFn, async () => ['10.0.0.5']).frameLogin('refresh-token-1')).rejects.toMatchObject({ code: 'portal_private' })
    await expect(new PortalAuth(CFG, fakeB24({ endpoint: 'http://crm.alpha.by/rest/' }).fetchFn, publicDns).frameLogin('refresh-token-1')).rejects.toMatchObject({ code: 'bad_token_response' })
    await expect(new PortalAuth(CFG, fakeB24({ grantOn: 'https://nowhere' }).fetchFn, publicDns).frameLogin('refresh-token-1')).rejects.toBeInstanceOf(LoginError)
  })
  it('the client secret never reaches the console or an error text', async () => {
    const out: string[] = []
    const record = (...a: unknown[]) => {
      out.push(a.map(String).join(' '))
    }
    const spies = (['log', 'warn', 'error'] as const).map(k => vi.spyOn(console, k).mockImplementation(record))
    try {
      await new PortalAuth(CFG, fakeB24().fetchFn, publicDns).frameLogin('refresh-token-1')
      const err = await new PortalAuth(CFG, fakeB24({ grantOn: 'https://nowhere' }).fetchFn, publicDns).frameLogin('refresh-token-1').catch((e: Error) => e)
      out.push(String((err as Error).message), JSON.stringify(err))
    } finally {
      spies.forEach(s => s.mockRestore())
    }
    expect(out.join('\n')).not.toContain('s3cret')
  })
})

describe('AdminSessions', () => {
  const login = { memberId: 'a1b2c3d4e5f60718', host: 'crm.alpha.by', userId: 7, admin: true, endpoint: 'https://crm.alpha.by/rest/', access: 'acc-1', expiresIn: 3600 }
  it('create → get with the access token; unknown and malformed tokens → null', async () => {
    const s = new AdminSessions(new MemoryStore(), Buffer.alloc(32, 1))
    const { token } = await s.create(login)
    expect(await s.get(token)).toMatchObject({ memberId: login.memberId, host: login.host, access: 'acc-1' })
    expect(await s.get('A'.repeat(43))).toBeNull()
    expect(await s.get('short')).toBeNull()
    expect(await s.get(undefined)).toBeNull()
  })
  it('a session sealed with another key does not read; drop removes it', async () => {
    const store = new MemoryStore()
    const { token } = await new AdminSessions(store, Buffer.alloc(32, 1)).create(login)
    expect(await new AdminSessions(store, Buffer.alloc(32, 2)).get(token)).toBeNull()
    const s = new AdminSessions(store, Buffer.alloc(32, 1))
    await s.drop(token)
    expect(await s.get(token)).toBeNull()
  })
  it('lives no longer than the access token, and at most an hour', async () => {
    let now = 0
    const store = new MemoryStore(() => now)
    const s = new AdminSessions(store, Buffer.alloc(32, 1), () => now)
    const { token } = await s.create({ ...login, expiresIn: 600 })
    now = 541_000
    expect(await s.get(token)).toBeNull()
    const long = await s.create({ ...login, expiresIn: 99_999 })
    now += 3601_000
    expect(await s.get(long.token)).toBeNull()
  })
  it('the access token is not stored in plain text', async () => {
    const store = new MemoryStore()
    const { token } = await new AdminSessions(store, Buffer.alloc(32, 1)).create(login)
    const raw = JSON.stringify((store as unknown as { m: Map<string, unknown> }).m.get([...(store as unknown as { m: Map<string, unknown> }).m.keys()][0]!))
    expect(raw).not.toContain('acc-1')
    expect(raw).not.toContain(token)
  })
})

describe('RedisStore', () => {
  function fakeRedis(): RedisLike & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return {
      data,
      async get(k) {
        return data.get(k) ?? null
      },
      async set(k, v, _ex, _ttl, nx) {
        if (nx === 'NX' && data.has(k)) return null
        data.set(k, v)
        return 'OK'
      },
      async del(k) {
        return data.delete(k) ? 1 : 0
      }
    }
  }
  it('JSON round-trip under a prefix; putIfAbsent is SET NX', async () => {
    const r = fakeRedis()
    const s = new RedisStore(r)
    await s.put('a', { x: 1 }, 10)
    expect(await s.get('a')).toEqual({ x: 1 })
    expect([...r.data.keys()]).toEqual(['cc:a'])
    expect(await s.putIfAbsent('n', 1, 601)).toBe(true)
    expect(await s.putIfAbsent('n', 1, 601)).toBe(false)
    await s.del('a')
    expect(await s.get('a')).toBeNull()
  })
})

describe('RedisStore failures', () => {
  it('any Redis error becomes StoreUnavailable (routes answer 503, not 500)', async () => {
    const down: RedisLike = {
      get: async () => { throw new Error('Connection is closed') },
      set: async () => { throw new Error('OOM command not allowed') },
      del: async () => { throw new Error('x') }
    }
    const s = new RedisStore(down)
    await expect(s.get('a')).rejects.toBeInstanceOf(StoreUnavailable)
    await expect(s.putIfAbsent('n', 1, 601)).rejects.toBeInstanceOf(StoreUnavailable)
    await expect(s.put('a', 1, 1)).rejects.toBeInstanceOf(StoreUnavailable)
  })
})

describe('rate limits', () => {
  it('client address: the LAST X-Forwarded-For entry (added by the proxy), else the socket', () => {
    expect(clientIp('6.6.6.6, 10.0.0.9', '172.18.0.2')).toBe('10.0.0.9')
    expect(clientIp(' 1.1.1.1 ', undefined)).toBe('1.1.1.1')
    expect(clientIp(undefined, '172.18.0.2')).toBe('172.18.0.2')
    expect(clientIp('', undefined)).toBe('unknown')
  })
  it('fixed window per key', () => {
    hits.clear()
    expect([1, 2, 3].map(() => takeHit('k', 2, 60, 0))).toEqual([true, true, false])
    expect(takeHit('k', 2, 60, 60_000)).toBe(true)
  })
  it('a full table sweeps expired keys and never resets live counters', () => {
    hits.clear()
    for (let i = 0; i < 20_000; i++) takeHit(`x${i}`, 1, 60, 0)
    takeHit('victim', 1, 60, 0)
    // New keys while every window is live are refused — the victim's spent counter is not wiped.
    expect(takeHit('new', 1, 60, 1000)).toBe(false)
    expect(takeHit('victim', 1, 60, 1000)).toBe(false)
    // After the windows expire, space frees up.
    expect(takeHit('new', 1, 60, 61_000)).toBe(true)
    hits.clear()
  })
})

describe('readJsonCapped', () => {
  it('reads small JSON, refuses bodies over the cap and non-objects', async () => {
    expect(await readJsonCapped(Response.json({ a: 1 }))).toEqual({ a: 1 })
    expect(await readJsonCapped(new Response('x'.repeat(300 * 1024)))).toEqual({})
    expect(await readJsonCapped(new Response(JSON.stringify({ big: 'y'.repeat(300 * 1024) })))).toEqual({})
    expect(await readJsonCapped(new Response('[1]'))).toEqual({})
    expect(await readJsonCapped(new Response('not json'))).toEqual({})
  })
})
