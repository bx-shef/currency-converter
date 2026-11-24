import { createHash } from 'node:crypto'
import { decrypt, deriveKey, encrypt, randomToken } from './crypto'
import type { PortalAdminLogin } from './oauth'
import type { KvStore } from './store'

// Session of the page in the portal frame (Bearer). Stores who logged in (from the OAuth server's answer) and
// the portal access token, sealed, to re-ask `user.admin` on every key action. Lives no longer than that access
// token: after it the frame logs in again. The store keeps only sha256 of the Bearer.

export const SESSION_MAX_SEC = 3600

export interface AdminSession { memberId: string, host: string, userId: number, admin: boolean, endpoint: string, at: number }
interface Stored extends AdminSession { access: string }

const keyOf = (token: string) => `appsess:${createHash('sha256').update(token).digest('base64url')}`
const BEARER = /^[A-Za-z0-9_-]{43}$/

export class AdminSessions {
  private readonly key: Buffer

  constructor(private readonly store: KvStore, master: Buffer, private readonly now: () => number = () => Date.now()) {
    this.key = deriveKey(master, 'cc-admin-session')
  }

  async create(login: PortalAdminLogin): Promise<{ token: string, session: AdminSession }> {
    const token = randomToken(32)
    const session: AdminSession = { memberId: login.memberId, host: login.host, userId: login.userId, admin: login.admin, endpoint: login.endpoint, at: this.now() }
    const ttl = Math.max(60, Math.min(SESSION_MAX_SEC, login.expiresIn - 60))
    await this.store.put(keyOf(token), encrypt(this.key, JSON.stringify({ ...session, access: login.access } satisfies Stored)), ttl)
    return { token, session }
  }

  /** Session and its access token, or null (unknown, expired, tampered). */
  async get(token: string | undefined): Promise<(AdminSession & { access: string }) | null> {
    if (!token || !BEARER.test(token)) return null
    const packed = await this.store.get<string>(keyOf(token))
    if (!packed) return null
    try {
      const s = JSON.parse(decrypt(this.key, packed)) as Stored
      if (this.now() - s.at > SESSION_MAX_SEC * 1000) return null
      return s
    } catch {
      return null
    }
  }

  async drop(token: string | undefined): Promise<void> {
    if (token && BEARER.test(token)) await this.store.del(keyOf(token))
  }
}
