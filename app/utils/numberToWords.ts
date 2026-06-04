/**
 * Russian "amount in words" for ruble-denominated currencies (BYN and RUB —
 * both use the «рубль / копейка» denominations and identical word forms).
 * Lower-case (matches the source data; the caller capitalises if a cheque line is needed):
 *   123.45 → "сто двадцать три рубля 45 копеек"
 *     1.01 → "один рубль 01 копейка"          (singular kopeck inflection)
 *   1234.00 → "одна тысяча двести тридцать четыре рубля 00 копеек"
 *
 * Returns '' for NaN / ±Infinity so the caller can safely render the result
 * directly via {{ }} interpolation without an extra guard.
 */

const UNITS_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const UNITS_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

const RUBLE_FORMS: [string, string, string] = ['рубль', 'рубля', 'рублей']
const KOPECK_FORMS: [string, string, string] = ['копейка', 'копейки', 'копеек']
const THOUSAND_FORMS: [string, string, string] = ['тысяча', 'тысячи', 'тысяч']
const MILLION_FORMS: [string, string, string] = ['миллион', 'миллиона', 'миллионов']
const BILLION_FORMS: [string, string, string] = ['миллиард', 'миллиарда', 'миллиардов']

/** Converts 0..999 to Russian words. `feminine` toggles "одна/две" for тысяча. */
function threeDigit(n: number, feminine: boolean): string {
  if (n === 0) return ''
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const u = n % 10
  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h]!)
  if (t === 1) parts.push(TEENS[u]!)
  else {
    if (t) parts.push(TENS[t]!)
    if (u) parts.push((feminine ? UNITS_F : UNITS_M)[u]!)
  }
  return parts.join(' ')
}

/** Russian noun pluralisation: returns one of three forms based on quantity. */
export function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n)
  const mod100 = abs % 100
  const mod10 = abs % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

/** Converts a non-negative integer up to a few billions to Russian words; `0` → `'ноль'`. */
function integerToWords(n: number): string {
  if (n === 0) return 'ноль'
  const parts: string[] = []
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1_000)
  const rest = n % 1_000
  if (billions) parts.push(threeDigit(billions, false), pluralize(billions, BILLION_FORMS))
  if (millions) parts.push(threeDigit(millions, false), pluralize(millions, MILLION_FORMS))
  if (thousands) parts.push(threeDigit(thousands, true), pluralize(thousands, THOUSAND_FORMS))
  if (rest) parts.push(threeDigit(rest, false))
  return parts.join(' ')
}

/**
 * Formats a ruble amount (BYN or RUB) as a Russian "sum in words" string.
 * @returns '' for NaN / ±Infinity; capitalised string otherwise.
 */
export function rublesAmountInWords(amount: number): string {
  if (!isFinite(amount)) return ''
  const sign = amount < 0 ? 'минус ' : ''
  // Round the whole amount to kopecks first so floating-point noise (e.g. 1.999)
  // doesn't end up as "1 rouble 100 kopecks" — round propagates into roubles.
  const totalKopecks = Math.round(Math.abs(amount) * 100)
  const rubles = Math.floor(totalKopecks / 100)
  const kopecks = totalKopecks % 100
  const rubWords = integerToWords(rubles)
  const rubInfl = pluralize(rubles, RUBLE_FORMS)
  const kopStr = String(kopecks).padStart(2, '0')
  const kopInfl = pluralize(kopecks, KOPECK_FORMS)
  return `${sign}${rubWords} ${rubInfl} ${kopStr} ${kopInfl}`
}
