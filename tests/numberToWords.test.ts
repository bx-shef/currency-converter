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
    expect(bynAmountInWords(0)).toBe('Ноль рублей 00 копеек')
  })
  it('one rouble exact', () => {
    expect(bynAmountInWords(1)).toBe('Один рубль 00 копеек')
  })
  it('handles kopecks', () => {
    expect(bynAmountInWords(1.45)).toBe('Один рубль 45 копеек')
    expect(bynAmountInWords(123.45)).toBe('Сто двадцать три рубля 45 копеек')
  })
  it('rounds kopecks to nearest cent', () => {
    expect(bynAmountInWords(1.235)).toBe('Один рубль 24 копейки')
  })
  it('uses feminine for thousands', () => {
    expect(bynAmountInWords(1000)).toBe('Одна тысяча рублей 00 копеек')
    expect(bynAmountInWords(2000)).toBe('Две тысячи рублей 00 копеек')
  })
  it('mixes orders of magnitude', () => {
    expect(bynAmountInWords(1234567.89))
      .toBe('Один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь рублей 89 копеек')
  })
  it('handles negative', () => {
    expect(bynAmountInWords(-5)).toBe('Минус пять рублей 00 копеек')
  })
  it('empty for non-finite', () => {
    expect(bynAmountInWords(NaN)).toBe('')
    expect(bynAmountInWords(Infinity)).toBe('')
  })
})
