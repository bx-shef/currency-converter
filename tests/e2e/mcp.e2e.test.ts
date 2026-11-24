import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpSign } from '../../server/lib/mcp/protocol'

// The whole path on the BUILT server (.output, `pnpm build` first — `pnpm test:e2e`): portal admin login from the
// frame against a fake Bitrix24 (OAuth server + REST), the connection key, signed manifest and call, the
// rejections a caller sees, and the security headers. Values are never logged by the server; this test reads
// only HTTP answers.

const ENTRY = '.output/server/index.mjs'
if (!existsSync(ENTRY)) throw new Error('no build — run `pnpm build` before `pnpm test:e2e`')

const MEMBER = 'a1b2c3d4e5f60718'
const HOST = '127.0.0.1'
let fake: Server
let app: ChildProcess
let base = ''
let isAdmin = true

async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>(r => s.listen(0, HOST, r))
  const { port } = s.address() as AddressInfo
  await new Promise(r => s.close(r))
  return port
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
        if (url.searchParams.get('client_secret') !== 's3cret' || url.searchParams.get('refresh_token') !== 'frame-refresh-1') return json(400, { error: 'invalid_grant' })
        return json(200, { access_token: 'acc-1', expires_in: 3600, member_id: MEMBER, client_endpoint: `http://${HOST}:${port}/rest/` })
      }
      const auth = (JSON.parse(body || '{}') as { auth?: string }).auth
      if (auth !== 'acc-1') return json(401, { error: 'invalid_token' })
      if (url.pathname === '/rest/user.current.json') return json(200, { result: { ID: '7' } })
      if (url.pathname === '/rest/user.admin.json') return json(200, { result: isAdmin })
      json(404, { error: 'ERROR_METHOD_NOT_FOUND' })
    })
  })
  await new Promise<void>(r => fake.listen(0, HOST, r))
  const fakePort = (fake.address() as AddressInfo).port
  const port = await freePort()
  base = `http://${HOST}:${port}`
  app = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      HOST, PORT: String(port), NODE_ENV: 'production',
      PUBLIC_URL: base,
      B24_CLIENT_ID: 'local.app', B24_CLIENT_SECRET: 's3cret',
      ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      B24_OAUTH_SERVERS: `http://${HOST}:${fakePort}`,
      REDIS_URL: ''
    },
    stdio: 'ignore'
  })
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${base}/health`).then(r => r.ok, () => false)) return
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('server did not start')
}, 30_000)

afterAll(async () => {
  app?.kill()
  await new Promise(r => fake?.close(r))
})

const login = async (refresh = 'frame-refresh-1') =>
  fetch(`${base}/api/app/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }) })

const signed = (key: string, ts: number, body = '', member = MEMBER) => ({
  'X-Shef-Ts': String(ts), 'X-Shef-Member': member, 'X-Shef-Signature': mcpSign(key, String(ts), body), 'Content-Type': 'application/json'
})
const callBody = (o: { tool?: string, nonce?: string, host?: string, args?: unknown } = {}) => JSON.stringify({
  tool: o.tool ?? 'sum_in_words',
  args: o.args ?? { amount: 123.45, currency: 'BYN' },
  who: { member_id: MEMBER, user_id: 7, host: o.host ?? HOST },
  ts: Math.floor(Date.now() / 1000),
  nonce: o.nonce ?? randomBytes(16).toString('hex')
})

describe('MCP on the built server', () => {
  let token = ''
  let key = ''

  it('frame login (refresh exchanged with our client_secret) → Bearer', async () => {
    expect((await login('someone-elses-refresh')).status).toBe(401)
    const r = await login()
    expect(r.status).toBe(200)
    const j = await r.json() as { token: string, admin: boolean, url: string }
    expect(j).toMatchObject({ admin: true, url: base })
    token = j.token
  })

  it('key screen: no key → issue shows it once → status never repeats it', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    expect(await (await fetch(`${base}/api/app/mcp-key`, { headers: auth })).json()).toEqual({ exists: false, url: base })
    const issued = await (await fetch(`${base}/api/app/mcp-key/issue`, { method: 'POST', headers: auth })).json() as { key: string, exists: boolean }
    expect(issued.exists).toBe(true)
    expect(issued.key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    key = issued.key
    const status = await (await fetch(`${base}/api/app/mcp-key`, { headers: auth })).text()
    expect(status).not.toContain(key)
    expect(JSON.parse(status)).toEqual({ exists: true, url: base })
  })

  it('no session → 401; admin rights taken away meanwhile → 403', async () => {
    expect((await fetch(`${base}/api/app/mcp-key`)).status).toBe(401)
    isAdmin = false
    try {
      expect((await fetch(`${base}/api/app/mcp-key/issue`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status).toBe(403)
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
    const h = signed(key, JSON.parse(body).ts, body)
    const r = await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: h, body })
    expect(r.status).toBe(200)
    const out = await r.json() as { content: { text: string }[] }
    expect(JSON.parse(out.content[0]!.text).words).toBe('Сто двадцать три рубля 45 копеек')
    expect((await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: h, body })).status).toBe(409)
  })

  it('every 401 looks the same: unknown member, wrong key, tampered body, foreign host', async () => {
    const ts = Math.floor(Date.now() / 1000)
    const bodies: [Record<string, string>, string][] = []
    const b1 = callBody()
    bodies.push([signed(key, ts, b1, 'ffffffffffffffff'), b1])
    bodies.push([signed('x'.repeat(43), ts, b1), b1])
    bodies.push([signed(key, ts, b1), b1.replace('123.45', '999')])
    const b4 = callBody({ host: 'crm.other.by' })
    bodies.push([signed(key, JSON.parse(b4).ts, b4), b4])
    const answers = await Promise.all(bodies.map(async ([h, b]) => {
      const r = await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: h, body: b })
      return `${r.status} ${await r.text()}`
    }))
    expect(new Set(answers)).toEqual(new Set(['401 {"error":"unauthorized"}']))
  })

  it('body over 64 KB is 413; unknown tool is 404', async () => {
    const big = 'x'.repeat(64 * 1024 + 1)
    expect((await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: signed(key, Math.floor(Date.now() / 1000), big), body: big })).status).toBe(413)
    const b = callBody({ tool: 'nope' })
    expect((await fetch(`${base}/api/mcp/call`, { method: 'POST', headers: signed(key, JSON.parse(b).ts, b), body: b })).status).toBe(404)
  })

  it('revoked key → the manifest answers 401', async () => {
    await fetch(`${base}/api/app/mcp-key/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect((await fetch(`${base}/api/mcp/manifest`, { headers: signed(key, Math.floor(Date.now() / 1000)) })).status).toBe(401)
  })

  it('pages: GET and POST (as the portal opens them) with the CSP; assets with nosniff', async () => {
    for (const method of ['GET', 'POST']) {
      for (const p of ['/', '/install', '/widget/converter']) {
        const r = await fetch(`${base}${p}`, { method, body: method === 'POST' ? 'AUTH_ID=x' : undefined })
        expect(r.status, `${method} ${p}`).toBe(200)
        expect(r.headers.get('content-security-policy'), `${method} ${p}`).toMatch(/script-src 'self' 'sha256-/)
        expect(r.headers.get('x-content-type-options')).toBe('nosniff')
      }
    }
    const img = await fetch(`${base}/og.png`)
    expect(img.headers.get('x-content-type-options')).toBe('nosniff')
    expect(img.headers.get('strict-transport-security')).toContain('max-age=')
  })
})
