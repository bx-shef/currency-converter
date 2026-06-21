import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from '../app/utils/url'

describe('safeHttpUrl', () => {
  it('keeps http and https URLs unchanged', () => {
    expect(safeHttpUrl('https://bx-shef.by', 'https://fb')).toBe('https://bx-shef.by')
    expect(safeHttpUrl('http://example.com/x', 'https://fb')).toBe('http://example.com/x')
    expect(safeHttpUrl('HTTPS://UP.example', 'https://fb')).toBe('HTTPS://UP.example')
  })

  it('falls back for dangerous schemes, other schemes and empty input', () => {
    expect(safeHttpUrl('javascript:alert(1)', 'https://fb')).toBe('https://fb')
    expect(safeHttpUrl('data:text/html,<script>', 'https://fb')).toBe('https://fb')
    expect(safeHttpUrl('ftp://host/file', 'https://fb')).toBe('https://fb')
    expect(safeHttpUrl('//evil.example', 'https://fb')).toBe('https://fb')
    expect(safeHttpUrl('', 'https://fb')).toBe('https://fb')
  })
})
