import { useB24 } from '~/composables/useB24'

// Session of the portal admin for the «Ключ для shef.cowork» card (docs/MCP.md). Login: the frame's refresh_token
// goes to POST /api/app/session, the server exchanges it at the Bitrix24 OAuth server with our client_secret
// (who and which portal come from there, not from the browser). A refresh token is single-use: the first login
// uses the one the portal handed the frame on open, later ones a fresh one from `refreshAuth()`.

export type McpLogin = { state: 'ready', admin: boolean } | { state: 'off' } | { state: 'error', message: string }

export interface McpKeyState { exists: boolean, url: string, key?: string }

let token = ''
let initialUsed = false

async function refreshToken(): Promise<string> {
  const frame = useB24().getOrThrow()
  const initial = !initialUsed ? frame.auth.getAuthData() : false
  initialUsed = true
  if (initial && initial.refresh_token) return initial.refresh_token
  return (await frame.auth.refreshAuth()).refresh_token
}

/** Error text from an h3 error answer ({ statusMessage }) or a generic one. */
function messageOf(e: unknown): string {
  const d = (e as { data?: { statusMessage?: unknown, message?: unknown } })?.data
  const m = typeof d?.statusMessage === 'string' ? d.statusMessage : typeof d?.message === 'string' ? d.message : ''
  return m || 'Сервер приложения не ответил — попробуйте ещё раз'
}

export function useMcpAdmin() {
  /** Log in from the frame. `off` — the server has no shef.cowork settings (503): the card is not shown. */
  async function login(): Promise<McpLogin> {
    try {
      const r = await $fetch<{ token?: string, admin: boolean }>('/api/app/session', { method: 'POST', body: { refresh: await refreshToken() } })
      // A session exists only for a portal admin; anyone else gets { admin: false } and no token.
      token = r.admin && r.token ? r.token : ''
      return { state: 'ready', admin: !!token }
    } catch (e) {
      if ((e as { status?: number })?.status === 503) return { state: 'off' }
      return { state: 'error', message: messageOf(e) }
    }
  }

  /** Key screen call with the session; an expired session logs in again once. */
  async function key(action: 'status' | 'issue' | 'revoke'): Promise<McpKeyState> {
    const path = action === 'status' ? '/api/app/mcp-key' : `/api/app/mcp-key/${action}`
    const send = () => $fetch<McpKeyState>(path, { method: action === 'status' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}` } })
    try {
      return await send()
    } catch (e) {
      if ((e as { status?: number })?.status !== 401) throw new Error(messageOf(e), { cause: e })
      const again = await login()
      if (again.state !== 'ready') throw new Error(again.state === 'error' ? again.message : 'Сервер приложения не настроен', { cause: e })
      try {
        return await send()
      } catch (e2) {
        throw new Error(messageOf(e2), { cause: e2 })
      }
    }
  }

  return { login, key }
}
