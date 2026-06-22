import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The i18n orphan-key guard (issue #94) lives ONLY in eslint.config.mjs, so a
// silent disable or a wrong `src` path would let orphan keys back in without any
// test failing (the rule would scan nothing → every key looks "used"). This
// pins the config invariants, mirroring the mdReviewStamp convention.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const config = readFileSync(join(repoRoot, 'eslint.config.mjs'), 'utf-8')

describe('i18n no-unused-keys lint guard', () => {
  it('enables @intlify/vue-i18n/no-unused-keys at severity "error"', () => {
    expect(config).toContain('@intlify/vue-i18n/no-unused-keys')
    // Warnings do not fail CI — the guard must be an error.
    expect(config).toMatch(/no-unused-keys'\s*:\s*\[\s*'error'/)
  })

  it('scans an existing source directory (a wrong src silently disables the guard)', () => {
    const match = config.match(/src:\s*'([^']+)'/)
    expect(match, 'no-unused-keys must set an explicit `src`').not.toBeNull()
    expect(existsSync(join(repoRoot, match![1]))).toBe(true)
  })

  it('points localeDir at the locale JSON directory', () => {
    expect(config).toContain('./i18n/locales/*.json')
    expect(existsSync(join(repoRoot, 'i18n/locales'))).toBe(true)
  })
})
