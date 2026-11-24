import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

// Ported from bx-shef/use-bitrix24-sync (server/lib/crypto.ts): AES-256-GCM sealing of connection keys
// at rest, key derived per purpose from ENCRYPTION_KEY.

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** Purpose-bound 32-byte key from the master secret (HKDF-SHA256): one label per purpose. */
export function deriveKey(master: Buffer, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), label, 32))
}

/** AES-256-GCM; output is `iv.tag.ciphertext` in base64url. */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64url')).join('.')
}

export function decrypt(key: Buffer, packed: string): string {
  const [iv, tag, body] = packed.split('.').map(p => Buffer.from(p, 'base64url'))
  // Full 16-byte tag only: GCM would otherwise accept a truncated (4-byte) tag.
  if (!iv || !tag || !body || iv.length !== 12 || tag.length !== 16) throw new Error('bad ciphertext')
  const d = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}
