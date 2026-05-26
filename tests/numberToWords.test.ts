import { describe, expect, it } from 'vitest'
import { bynAmountInWords, pluralize } from '../app/utils/numberToWords'

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

describe('bynAmountInWords', () => {
  it('zero', () => {
    expect(bynAmountInWords(0)).toBe('ноль рублей 00 копеек')
  })
  it('one rouble exact', () => {
    expect(bynAmountInWords(1)).toBe('один рубль 00 копеек')
  })
  it('handles kopecks', () => {
    expect(bynAmountInWords(1.45)).toBe('один рубль 45 копеек')
    expect(bynAmountInWords(123.45)).toBe('сто двадцать три рубля 45 копеек')
  })
  it('rounds kopecks to nearest cent', () => {
    expect(bynAmountInWords(1.235)).toBe('один рубль 24 копейки')
  })
  it('carries kopecks into roubles on round-up (1.999 → 2 рубля)', () => {
    expect(bynAmountInWords(1.999)).toBe('два рубля 00 копеек')
    expect(bynAmountInWords(0.999)).toBe('один рубль 00 копеек')
    expect(bynAmountInWords(999.995)).toBe('одна тысяча рублей 00 копеек')
  })
  it('declines roubles for 11/21/22 and friends', () => {
    expect(bynAmountInWords(11)).toBe('одиннадцать рублей 00 копеек')
    expect(bynAmountInWords(21)).toBe('двадцать один рубль 00 копеек')
    expect(bynAmountInWords(22)).toBe('двадцать два рубля 00 копеек')
    expect(bynAmountInWords(25)).toBe('двадцать пять рублей 00 копеек')
    expect(bynAmountInWords(101)).toBe('сто один рубль 00 копеек')
  })
  it('declines kopecks for 1/2/5/11/21', () => {
    expect(bynAmountInWords(1.01)).toBe('один рубль 01 копейка')
    expect(bynAmountInWords(1.02)).toBe('один рубль 02 копейки')
    expect(bynAmountInWords(1.05)).toBe('один рубль 05 копеек')
    expect(bynAmountInWords(1.11)).toBe('один рубль 11 копеек')
    expect(bynAmountInWords(1.21)).toBe('один рубль 21 копейка')
  })
  it('uses feminine for thousands', () => {
    expect(bynAmountInWords(1000)).toBe('одна тысяча рублей 00 копеек')
    expect(bynAmountInWords(2000)).toBe('две тысячи рублей 00 копеек')
  })
  it('mixes orders of magnitude', () => {
    expect(bynAmountInWords(1234567.89))
      .toBe('один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь рублей 89 копеек')
  })
  it('handles billions (masculine)', () => {
    expect(bynAmountInWords(1_000_000_000)).toBe('один миллиард рублей 00 копеек')
    expect(bynAmountInWords(2_000_000_000)).toBe('два миллиарда рублей 00 копеек')
  })
  it('handles negative', () => {
    expect(bynAmountInWords(-5)).toBe('минус пять рублей 00 копеек')
  })
  it('empty for non-finite', () => {
    expect(bynAmountInWords(NaN)).toBe('')
    expect(bynAmountInWords(Infinity)).toBe('')
    expect(bynAmountInWords(-Infinity)).toBe('')
  })
})
