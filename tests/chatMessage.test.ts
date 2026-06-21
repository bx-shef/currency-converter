import { describe, expect, it } from 'vitest'
import { buildConversionLines, wordsCurrencyCode, type MessageRow } from '../app/utils/chatMessage'

describe('buildConversionLines', () => {
  const rows: MessageRow[] = [
    { code: 'BYN', value: 100 },
    { code: 'USD', value: 35.91 },
    { code: 'EUR', value: 33.1 },
    { code: 'KZT', value: undefined }
  ]

  it('builds "X = Y" lines anchored on the active currency, plain numbers', () => {
    expect(buildConversionLines(rows, 'BYN')).toEqual([
      '100.00 BYN = 35.91 USD',
      '100.00 BYN = 33.10 EUR'
    ])
  })

  it('skips the active row and rows without a numeric value', () => {
    const lines = buildConversionLines(rows, 'BYN')
    expect(lines.some(l => l.includes('= 100.00 BYN'))).toBe(false) // no self line
    expect(lines.some(l => l.includes('KZT'))).toBe(false) // undefined value skipped
  })

  it('returns [] when the active row is missing or has no value', () => {
    expect(buildConversionLines(rows, 'GBP')).toEqual([])
    expect(buildConversionLines([{ code: 'BYN', value: undefined }], 'BYN')).toEqual([])
    expect(buildConversionLines([], 'BYN')).toEqual([])
  })

  it('anchors on whichever currency is active', () => {
    expect(buildConversionLines(rows, 'USD')).toEqual([
      '35.91 USD = 100.00 BYN',
      '35.91 USD = 33.10 EUR'
    ])
  })
})

describe('wordsCurrencyCode', () => {
  it('keeps RUB when active, else falls back to BYN', () => {
    expect(wordsCurrencyCode('RUB')).toBe('RUB')
    expect(wordsCurrencyCode('BYN')).toBe('BYN')
    expect(wordsCurrencyCode('USD')).toBe('BYN')
    expect(wordsCurrencyCode('EUR')).toBe('BYN')
  })
})
