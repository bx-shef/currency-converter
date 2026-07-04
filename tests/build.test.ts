import { describe, expect, it } from 'vitest'
import { REPO_URL, shortSha, commitUrl } from '../app/utils/build'

describe('shortSha', () => {
  it('takes the first 7 chars of a full sha', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456')
  })

  it('returns empty for missing/blank sha (dev builds)', () => {
    expect(shortSha('')).toBe('')
    expect(shortSha('   ')).toBe('')
    expect(shortSha(undefined)).toBe('')
    expect(shortSha(null)).toBe('')
  })

  it('trims surrounding whitespace before slicing', () => {
    expect(shortSha('  0123456789  ')).toBe('0123456')
  })
})

describe('commitUrl', () => {
  it('links to the exact commit when the sha is known', () => {
    expect(commitUrl('abc1234def')).toBe(`${REPO_URL}/commit/abc1234def`)
  })

  it('falls back to the repo root when the sha is unknown', () => {
    expect(commitUrl('')).toBe(REPO_URL)
    expect(commitUrl(undefined)).toBe(REPO_URL)
    expect(commitUrl(null)).toBe(REPO_URL)
  })

  it('points at the currency-converter repo', () => {
    expect(REPO_URL).toBe('https://github.com/bx-shef/currency-converter')
  })
})
