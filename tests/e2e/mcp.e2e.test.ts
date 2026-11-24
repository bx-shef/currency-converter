import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpSign } from '../../server/lib/mcp/protocol'

// The whole path on the BUILT server (.output, `pnpm build` first — `pnpm test:e2e`): portal admin login from the
// frame against a fake Bitrix24 (OAuth server + REST), the connection key, signed manifest and call, the
// rejections a caller sees, the security headers. With E2E_REDIS_URL set (CI service) the store is a real Redis.

const ENTRY = '.output/server/index.mjs'
if (!existsSync(ENTRY)) throw new Error('no build — run `pnpm build` before `pnpm test:e2e`')

const MEMBER = 'a1b2c3d4e5f60718'
const HOST = '127.0.0.1'
const REDIS_URL = process.env.E2E_REDIS_URL ?? ''
let fake: Server
const procs: ChildProcess[] = []
let isAdmin = true

async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>(r => s.listen(0, HOST, r))
  const { port } = s.address() as AddressInfo
  await new Promise(r => s.close(r))
  return port
}

/** Start the built server with the given environment; resolves to its base URL once /health answers. */
async function startServer(env: Record<string, string>): Promise<string> {
  const port = await freePort()
  const base = `http://${HOST}:${port}`
  const p = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, HOST, PORT: String(port), NODE_ENV: 'production', ...env, PUBLIC_URL: env.PUBLIC_URL === undefined ? base : env.PUBLIC_URL },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let stderr = ''
  p.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))
  procs.push(p)
  for (let i = 0; i < 80; i++) {
    if (await fetch(`${base}/health`).then(r => r.ok, () => false)) return base
    if (p.exitCode !== null) break
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`server did not start: ${stderr.slice(-500)}`)
}

beforeAll(async () => {
  fake = createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => (body += c.toString()))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x')
      const json = (code: number, o: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      const port = (fake.address() as AddressInfo).port
      if (url.pathname === '/oauth/token/') {
        const r = url.searchParams.get('refresh_token')
        if (url.searchParams.get('client_secret') !== 's3cret' || !['frame-refresh-1', 'employee-refresh'].includes(r ?? '')) return json(400, { error: 'invalid_grant' })
        return json(200, { access_token: r === 'employee-refresh' ? 'acc-emp' : 'acc-1', expires_in: 3600, member_id: MEMBER, client_endpoint: `http://${HOST}:${port}/rest/` })
      }
      const auth = (JSON.parse(body || '{}') as { auth?: string }).auth
      if (auth !== 'acc-1' && auth !== 'acc-emp') return json(401, { error: 'invalid_token' })
      if (url.pathname === '/rest/user.current.json') return json(200, { result: { ID: auth === 'acc-emp' ? '9' : '7' } })
      if (url.pathname === '/rest/user.admin.json') return json(200, { result: auth === 'acc-1' && isAdmin })
      json(404, { error: 'ERROR_METHOD_NOT_FOUND' })
    })
  })
  await new Promise<void>(r => fake.listen(0, HOST, r))
}, 30_000)

afterAll(async () => {
  procs.forEach(p => p.kill())
  await new Promise(r => fake?.close(r))
})

const configured = () => ({
  B24_CLIENT_ID: 'local.app', B24_CLIENT_SECRET: 's3cret',
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  B24_OAUTH_SERVERS: `http://${HOST}:${(fake.address() as AddressInfo).port}`,
  REDIS_URL
})

const signed = (key: string, ts: number, body = '', member = MEMBER) => ({
  'X-Shef-Ts': String(ts), 'X-Shef-Member': member, 'X-Shef-Signature': mcpSign(key, String(ts), body), 'Content-Type': 'application/json'
})
const callBody = (o: { tool?: string, host?: string } = {}) => JSON.stringify({
  tool: o.tool ?? 'sum_in_words',
  args: { amount: 123.45, currency: 'BYN' },
  who: { member_id: MEMBER, user_id: 7, host: o.host ?? HOST },
  ts: Math.floor(Date.now() / 1000),
  nonce: randomBytes(16).toString('hex')
})
/** A body without Content-Length (chunked). */
function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text))
      c.close()
    }
  })
}

const call = (base: string, key: string, body = callBody()) =>
  fetch(`${base}/api/mcp/call`, { method: 'POST', headers: signed(key, JSON.parse(body).ts, body), body })

describe(`MCP on the built server (store: ${REDIS_URL ? 'Redis' : 'memory'})`, () => {
  let base = ''
  let token = ''
  let key = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })
  const login = (refresh: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/app/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ refresh }) })

  beforeAll(async () => {
    base = await startServer(configured())
  }, 30_000)

  it('frame login (refresh exchanged with our client_secret) → Bearer for an admin', async () => {
    expect((await login('someone-elses-refresh')).status).toBe(401)
    const r = await login('frame-refresh-1')
    expect(r.status).toBe(200)
    const j = await r.json() as { token: string, admin: boolean, url: string }
    expect(j).toMatchObject({ admin: true, url: base })
    token = j.token
  })

  it('an employee who is not an admin gets no session at all', async () => {
    expect(await (await login('employee-refresh')).json()).toEqual({ admin: false })
  })

  it('login: JSON only (415), Content-Length required (411)', async () => {
    expect((await fetch(`${base}/api/app/session`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status).toBe(415)
    const chunked = streamOf('{"refresh":"x"}')
    const r = await fetch(`${base}/api/app/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: chunked, duplex: 'half' } as RequestInit)
    expect(r.status).toBe(411)
  })

  it('key screen: no key → issue shows it once → status never repeats it', async () => {
    expect(await (await fetch(`${base}/api/app/mcp-key`, { headers: auth() })).json()).toEqual({ exists: false, url: base })
    const issued = await (await fetch(`${base}/api/app/mcp-key/issue`, { method: 'POST', headers: auth() })).json() as { key: string, exists: boolean }
    expect(issued.key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    key = issued.key
    const status = await (await fetch(`${base}/api/app/mcp-key`, { headers: auth() })).text()
    expect(status).not.toContain(key)
    expect(JSON.parse(status)).toEqual({ exists: true, url: base })
  })

  it('no or unknown session → 401; admin rights taken away meanwhile → 403', async () => {
    expect((await fetch(`${base}/api/app/mcp-key`)).status).toBe(401)
    expect((await fetch(`${base}/api/app/mcp-key`, { headers: { Authorization: `Bearer ${'A'.repeat(43)}` } })).status).toBe(401)
    isAdmin = false
    try {
      expect((await fetch(`${base}/api/app/mcp-key/issue`, { method: 'POST', headers: auth() })).status).toBe(403)
      expect((await fetch(`${base}/api/app/mcp-key/revoke`, { method: 'POST', headers: auth() })).status).toBe(403)
    } finally {
      isAdmin = true
    }
  })

  it('signed manifest lists the four read tools', async () => {
    const r = await fetch(`${base}/api/mcp/manifest`, { headers: signed(key, Math.floor(Date.now() / 1000)) })
    expect(r.status).toBe(200)
    const { tools } = await r.json() as { tools: { name: string, kind: string }[] }
    expect(tools.map(t => [t.name, t.kind])).toEqual([['rates', 'read'], ['history', 'read'], ['convert', 'read'], ['sum_in_words', 'read']])
  })

  it('signed call runs the tool; a replayed nonce is 409', async () => {
    const body = callBody()
    const r = await call(base, key, body)
    expect(r.status).toBe(200)
    const out = await r.json() as { content: { text: string }[] }
    expect(JSON.parse(out.content[0]!.text).words).toBe('Сто двадцать три рубля 45 копеек')
    expect((await call(base, key, body)).status).toBe(409)
  })

  it('every 401 looks the same: unknown member, wrong key, tampered body, foreign host', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const b1 = callBody()
    const b4 = callBody({ host: 'crm.other.by' })
    const reqs: [Record<string, string>, string][] = [
      [signed(key, ts, b1, 'ffffffffffffffff'), b1],
      [signed('x'.repeat(43), ts, b1), b1],
      [signed(key, ts, b1), b1.replace('123.45', '999')],
      [signed(key, JSON.parse(b4).ts, b4), b4]
    ]
    const answers = await Promise.all(reqs.map(async ([h, b]) => {
      const r = await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: h, body: b })
      return `${r.status} ${await r.text()}`
    }))
    expect(new Set(answers)).toEqual(new Set(['401 {"error":"unauthorized"}']))
  })

  it('body over 64 KB is 413; no Content-Length is 411; unknown tool is 404', async () => {
    const big = 'x'.repeat(64 * 1024 + 1)
    expect((await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: signed(key, Math.floor(Date.now() / 1000), big), body: big })).status).toBe(413)
    const chunked = streamOf('{}')
    expect((await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: signed(key, Math.floor(Date.now() / 1000), '{}'), body: chunked, duplex: 'half' } as RequestInit)).status).toBe(411)
    expect((await call(base, key, callBody({ tool: 'nope' }))).status).toBe(404)
  })

  it('a new key replaces the old one: the old key is 401, the new one works', async () => {
    const issued = await (await fetch(`${base}/api/app/mcp-key/issue`, { method: 'POST', headers: auth() })).json() as { key: string }
    expect((await call(base, key)).status).toBe(401)
    expect((await call(base, issued.key)).status).toBe(200)
    key = issued.key
  })

  it('revoked key → manifest and call are 401; status says there is no key', async () => {
    const r = await (await fetch(`${base}/api/app/mcp-key/revoke`, { method: 'POST', headers: auth() })).json()
    expect(r).toEqual({ exists: false, url: base })
    expect((await fetch(`${base}/api/mcp/manifest`, { headers: signed(key, Math.floor(Date.now() / 1000)) })).status).toBe(401)
    expect((await call(base, key)).status).toBe(401)
  })

  it('pages: GET and POST (as the portal opens them) with a CSP whose hashes match the page’s inline scripts', async () => {
    for (const method of ['GET', 'POST']) {
      for (const p of ['/', '/install', '/widget/converter']) {
        const r = await fetch(`${base}${p}`, { method, body: method === 'POST' ? 'AUTH_ID=x&DOMAIN=b24.example.by' : undefined, redirect: 'manual' })
        expect(r.status, `${method} ${p}`).toBe(200)
        const csp = r.headers.get('content-security-policy') ?? ''
        expect(csp, `${method} ${p}`).toContain('frame-ancestors \'self\' https://*.bitrix24.ru')
        expect(r.headers.get('x-content-type-options')).toBe('nosniff')
        const html = await r.text()
        expect(html).toContain('<div id="__nuxt"')
        for (const [, js] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
          expect(csp, `${method} ${p}: inline script allowed`).toContain(`'sha256-${createHash('sha256').update(js ?? '').digest('base64')}'`)
        }
      }
    }
    const missing = await fetch(`${base}/no-such-page`, { headers: { Accept: 'text/html' } })
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-security-policy')).toContain('default-src \'self\'')
    const img = await fetch(`${base}/og.png`)
    expect(img.headers.get('x-content-type-options')).toBe('nosniff')
    expect(img.headers.get('strict-transport-security')).toContain('max-age=')
  })

  it('login limit cannot be dodged by a forged X-Forwarded-For (the last entry is the proxy’s)', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 22; i++) statuses.push((await login('someone-elses-refresh', { 'X-Forwarded-For': `${i}.1.1.1, 10.9.9.9` })).status)
    expect(statuses).toContain(429)
  })
})

describe('built server without shef.cowork settings', () => {
  let base = ''
  beforeAll(async () => {
    base = await startServer({ PUBLIC_URL: '', B24_CLIENT_ID: '', B24_CLIENT_SECRET: '', ENCRYPTION_KEY: '', REDIS_URL: '' })
  }, 30_000)

  it('tools and the key screen answer 503 not_configured; the site works', async () => {
    for (const [method, p] of [['GET', '/api/mcp/manifest'], ['POST', '/api/mcp/call'], ['POST', '/api/app/session'], ['GET', '/api/app/mcp-key']] as const) {
      const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })
      expect(r.status, p).toBe(503)
      expect(await r.json(), p).toEqual({ error: 'not_configured' })
    }
    expect((await fetch(`${base}/widget/converter`)).status).toBe(200)
  })
})
