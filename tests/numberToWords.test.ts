import { describe, expect, it } from 'vitest'
import { rublesAmountInWords, pluralize } from '../app/utils/numberToWords'

describe('pluralize', () => {
  const forms: [string, string, string] = ['рубль', 'рубля', 'рублей']
  it('singular for 1 and 21', () => {
    expect(pluralize(1, forms)).toBe('рубль')
    expect(pluralize(21, forms)).toBe('рубль')
    expect(pluralize(101, forms)).toBe('рубль')
  })
  it('genitive singular for 2-4, 22-24', () => {
    expect(pluralize(2, forms)).toBe('рубля')
    expect(pluralize(3, forms)).toBe('рубля')
    expect(pluralize(4, forms)).toBe('рубля')
    expect(pluralize(23, forms)).toBe('рубля')
  })
  it('genitive plural for 5-20, 11-14', () => {
    expect(pluralize(5, forms)).toBe('рублей')
    expect(pluralize(11, forms)).toBe('рублей')
    expect(pluralize(12, forms)).toBe('рублей')
    expect(pluralize(13, forms)).toBe('рублей')
    expect(pluralize(14, forms)).toBe('рублей')
    expect(pluralize(20, forms)).toBe('рублей')
    expect(pluralize(0, forms)).toBe('рублей')
  })
})

describe('rublesAmountInWords', () => {
  it('zero', () => {
    expect(rublesAmountInWords(0)).toBe('ноль рублей 00 копеек')
  })
  it('one rouble exact', () => {
    expect(rublesAmountInWords(1)).toBe('один рубль 00 копеек')
  })
  it('handles kopecks', () => {
    expect(rublesAmountInWords(1.45)).toBe('один рубль 45 копеек')
    expect(rublesAmountInWords(123.45)).toBe('сто двадцать три рубля 45 копеек')
  })
  it('rounds kopecks to nearest cent', () => {
    expect(rublesAmountInWords(1.235)).toBe('один рубль 24 копейки')
  })
  it('carries kopecks into roubles on round-up (1.999 → 2 рубля)', () => {
    expect(rublesAmountInWords(1.999)).toBe('два рубля 00 копеек')
    expect(rublesAmountInWords(0.999)).toBe('один рубль 00 копеек')
    expect(rublesAmountInWords(999.995)).toBe('одна тысяча рублей 00 копеек')
  })
  it('declines roubles for 11/21/22 and friends', () => {
    expect(rublesAmountInWords(11)).toBe('одиннадцать рублей 00 копеек')
    expect(rublesAmountInWords(21)).toBe('двадцать один рубль 00 копеек')
    expect(rublesAmountInWords(22)).toBe('двадцать два рубля 00 копеек')
    expect(rublesAmountInWords(25)).toBe('двадцать пять рублей 00 копеек')
    expect(rublesAmountInWords(101)).toBe('сто один рубль 00 копеек')
  })
  it('declines kopecks for 1/2/5/11/21', () => {
    expect(rublesAmountInWords(1.01)).toBe('один рубль 01 копейка')
    expect(rublesAmountInWords(1.02)).toBe('один рубль 02 копейки')
    expect(rublesAmountInWords(1.05)).toBe('один рубль 05 копеек')
    expect(rublesAmountInWords(1.11)).toBe('один рубль 11 копеек')
    expect(rublesAmountInWords(1.21)).toBe('один рубль 21 копейка')
  })
  it('uses feminine for thousands', () => {
    expect(rublesAmountInWords(1000)).toBe('одна тысяча рублей 00 копеек')
    expect(rublesAmountInWords(2000)).toBe('две тысячи рублей 00 копеек')
  })
  it('declines the thousands word for the 11–19 group', () => {
    expect(rublesAmountInWords(11000)).toBe('одиннадцать тысяч рублей 00 копеек')
    expect(rublesAmountInWords(12000)).toBe('двенадцать тысяч рублей 00 копеек')
    expect(rublesAmountInWords(21000)).toBe('двадцать одна тысяча рублей 00 копеек')
    expect(rublesAmountInWords(22000)).toBe('двадцать две тысячи рублей 00 копеек')
    expect(rublesAmountInWords(25000)).toBe('двадцать пять тысяч рублей 00 копеек')
  })
  it('mixes orders of magnitude', () => {
    expect(rublesAmountInWords(1234567.89))
      .toBe('один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь рублей 89 копеек')
  })
  it('handles billions (masculine)', () => {
    expect(rublesAmountInWords(1_000_000_000)).toBe('один миллиард рублей 00 копеек')
    expect(rublesAmountInWords(2_000_000_000)).toBe('два миллиарда рублей 00 копеек')
  })
  it('handles negative', () => {
    expect(rublesAmountInWords(-5)).toBe('минус пять рублей 00 копеек')
  })
  it('empty for non-finite', () => {
    expect(rublesAmountInWords(NaN)).toBe('')
    expect(rublesAmountInWords(Infinity)).toBe('')
    expect(rublesAmountInWords(-Infinity)).toBe('')
  })
  it('returns a lower-case string (caller capitalises for cheque lines)', () => {
    // Contract guard: the page renders the result verbatim. If someone re-adds
    // capitalisation here, decide on the caller side — this test should fail loudly.
    const result = rublesAmountInWords(123.45)
    expect(result[0]).toBe(result[0]!.toLowerCase())
    expect(result[0]).not.toBe(result[0]!.toUpperCase())
  })
})
