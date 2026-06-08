import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Review-stamp convention (see CLAUDE.md › Конвенции): every tracked .md carries
// `> Last reviewed: YYYY-MM-DD` (ISO date) as a blockquote right under its H1.
const STAMP_RE = /^> Last reviewed: \d{4}-\d{2}-\d{2}$/m

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** .md files tracked by git — naturally excludes node_modules/ and .nuxt/. */
function trackedMdFiles(): string[] {
  return execSync('git ls-files "*.md"', { cwd: repoRoot })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
}

describe('Markdown review stamp convention', () => {
  it('every tracked .md file carries a "> Last reviewed: YYYY-MM-DD" stamp', () => {
    const files = trackedMdFiles()
    expect(files.length).toBeGreaterThan(0) // sanity: git returned something

    const missing = files.filter(
      f => !STAMP_RE.test(readFileSync(join(repoRoot, f), 'utf-8'))
    )
    expect(missing, `Missing review stamp in:\n${missing.join('\n')}`).toEqual([])
  })
})
