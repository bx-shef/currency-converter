import { describe, expect, it } from 'vitest'
import { buildWordsLines, WORDS_CURRENCIES, type MessageRow } from '../app/utils/chatMessage'
import { rublesAmountInWords } from '../app/utils/numberToWords'
import { capitalizeFirst } from '../app/utils/formatters'

describe('buildWordsLines', () => {
  // RUB deliberately before BYN: the output must still be BYN→RUB (driven by
  // WORDS_CURRENCIES, not row order), so this makes the "in that order" assertion
  // load-bearing against an iteration-order regression.
  const rows: MessageRow[] = [
    { code: 'RUB', value: 2670.73 },
    { code: 'BYN', value: 100 },
    { code: 'USD', value: 35.91 },
    { code: 'KZT', value: undefined }
  ]

  it('builds a lowercase «прописью» line for BYN and RUB, in that order', () => {
    expect(buildWordsLines(rows, 'прописью', false)).toEqual([
      `BYN прописью: ${rublesAmountInWords(100)}`,
      `RUB прописью: ${rublesAmountInWords(2670.73)}`
    ])
  })

  it('capitalizes the first letter when asked (аб/Аб toggle)', () => {
    expect(buildWordsLines(rows, 'прописью', true)).toEqual([
      `BYN прописью: ${capitalizeFirst(rublesAmountInWords(100))}`,
      `RUB прописью: ${capitalizeFirst(rublesAmountInWords(2670.73))}`
    ])
  })

  it('uses the provided (localizable) label', () => {
    expect(buildWordsLines([{ code: 'BYN', value: 100 }], 'in words', false)).toEqual([
      `BYN in words: ${rublesAmountInWords(100)}`
    ])
  })

  it('skips rows without a numeric value and non-ruble currencies', () => {
    expect(buildWordsLines([{ code: 'RUB', value: undefined }, { code: 'USD', value: 5 }], 'прописью', false)).toEqual([])
  })

  it('returns [] for empty input; only BYN/RUB are eligible', () => {
    expect(buildWordsLines([], 'прописью', false)).toEqual([])
    expect(WORDS_CURRENCIES).toEqual(['BYN', 'RUB'])
  })
})
