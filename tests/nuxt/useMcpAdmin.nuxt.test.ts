import { beforeEach, describe, expect, it, vi } from 'vitest'

// useMcpAdmin (docs/MCP.md): login from the frame's refresh token (single-use: the first login uses the one the
// portal gave the frame, later ones a fresh one), the key calls with the session, one re-login on an expired
// session — never a loop.
const frame = vi.hoisted(() => ({
  isAdmin: true,
  getAuthData: vi.fn(() => ({ refresh_token: 'initial-refresh' }) as unknown),
  refreshAuth: vi.fn(async () => ({ refresh_token: 'fresh-refresh' }))
}))
vi.mock('~/composables/useB24', () => ({ useB24: () => ({ getOrThrow: () => ({ auth: frame }) }) }))

type Call = { url: string, opts: { method?: string, body?: { refresh?: string }, headers?: Record<string, string> } }
const calls: Call[] = []
let answer: (c: Call) => unknown

const httpError = (status: number, statusMessage = '') => Object.assign(new Error(`HTTP ${status}`), { status, data: { statusMessage } })

async function fresh() {
  vi.resetModules()
  calls.length = 0
  frame.getAuthData.mockClear()
  frame.refreshAuth.mockClear()
  vi.stubGlobal('$fetch', vi.fn(async (url: string, opts: Call['opts']) => {
    const c = { url, opts }
    calls.push(c)
    const r = answer(c)
    if (r instanceof Error) throw r
    return r
  }))
  return (await import('~/composables/useMcpAdmin')).useMcpAdmin()
}

describe('useMcpAdmin', () => {
  beforeEach(() => {
    answer = c => (c.url === '/api/app/session' ? { token: 'tok-1', admin: true } : { exists: false, url: 'https://cc.example.by' })
  })

  it('first login uses the refresh the portal gave the frame; the next one asks for a fresh token', async () => {
    const a = await fresh()
    expect(await a.login()).toEqual({ state: 'ready', admin: true })
    await a.login()
    expect(calls.map(c => c.opts.body?.refresh)).toEqual(['initial-refresh', 'fresh-refresh'])
    expect(frame.refreshAuth).toHaveBeenCalledTimes(1)
  })

  it('the key call carries the Bearer of the session', async () => {
    const a = await fresh()
    await a.login()
    await a.key('status')
    expect(calls[1]).toMatchObject({ url: '/api/app/mcp-key', opts: { method: 'GET', headers: { Authorization: 'Bearer tok-1' } } })
  })

  it('the portal says «not an admin»: no refresh spent, no request at all', async () => {
    frame.isAdmin = false
    try {
      const a = await fresh()
      expect(await a.login()).toEqual({ state: 'ready', admin: false })
      expect(calls).toEqual([])
      expect(frame.getAuthData).not.toHaveBeenCalled()
    } finally {
      frame.isAdmin = true
    }
  })

  it('not an admin by the server: no token kept, admin false', async () => {
    answer = () => ({ admin: false })
    const a = await fresh()
    expect(await a.login()).toEqual({ state: 'ready', admin: false })
  })

  it('503 → off (server not configured); other errors → error with the server text', async () => {
    answer = () => httpError(503)
    expect(await (await fresh()).login()).toEqual({ state: 'off' })
    answer = () => httpError(401, 'Битрикс24 не подтвердил вход')
    expect(await (await fresh()).login()).toEqual({ state: 'error', message: 'Битрикс24 не подтвердил вход' })
  })

  it('expired session: one re-login, then the call is repeated', async () => {
    let keyCalls = 0
    answer = (c) => {
      if (c.url === '/api/app/session') return { token: `tok-${calls.length}`, admin: true }
      return ++keyCalls === 1 ? httpError(401) : { exists: true, url: 'u' }
    }
    const a = await fresh()
    await a.login()
    expect(await a.key('issue')).toEqual({ exists: true, url: 'u' })
    expect(calls.filter(c => c.url === '/api/app/session')).toHaveLength(2)
  })

  it('still 401 after the re-login: an error, no loop', async () => {
    answer = c => (c.url === '/api/app/session' ? { token: 't', admin: true } : httpError(401, 'Сессия истекла'))
    const a = await fresh()
    await a.login()
    await expect(a.key('status')).rejects.toThrow('Сессия истекла')
    expect(calls.filter(c => c.url === '/api/app/session')).toHaveLength(2)
  })

  it('403 and 409 are shown as they are, without a re-login', async () => {
    answer = c => (c.url === '/api/app/session' ? { token: 't', admin: true } : httpError(409, 'На этот member_id уже выданы ключи 8 порталам'))
    const a = await fresh()
    await a.login()
    await expect(a.key('issue')).rejects.toThrow('8 порталам')
    expect(calls.filter(c => c.url === '/api/app/session')).toHaveLength(1)
  })
})
