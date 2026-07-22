import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The `pnpm check` alias and the SessionStart hook are tooling, not app code, so
// nothing else fails if they drift (a trimmed alias or a broken gate stays green
// until someone opens a web session). These pin their invariants, mirroring the
// mdReviewStamp / eslintI18nGuard convention.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** bash is required for the hook tests; skip gracefully where it is absent (Windows). */
function hasBash(): boolean {
  try {
    execFileSync('bash', ['-c', 'true'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const bashIt = hasBash() ? it : it.skip

describe('pnpm check alias (CLAUDE.md pre-push ritual)', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))

  it('runs lint, typecheck and test', () => {
    expect(pkg.scripts?.check, 'package.json must define scripts.check').toBeTypeOf('string')
    for (const step of ['lint', 'typecheck', 'test']) {
      expect(pkg.scripts.check, `check must include ${step}`).toContain(step)
    }
  })
})

describe('SessionStart hook', () => {
  const hook = join(repoRoot, '.claude/hooks/session-start.sh')

  bashIt('is syntactically valid bash', () => {
    expect(() => execFileSync('bash', ['-n', hook])).not.toThrow()
  })

  bashIt('is a no-op with no output when CLAUDE_CODE_REMOTE is not "true"', () => {
    // Force the gate closed even if the test itself runs inside a remote session
    // (where CLAUDE_CODE_REMOTE=true would otherwise trigger a real pnpm install).
    const out = execFileSync('bash', [hook], {
      env: { ...process.env, CLAUDE_CODE_REMOTE: '' },
      encoding: 'utf-8'
    })
    expect(out).toBe('')
  })
})
