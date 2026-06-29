/**
 * Pure helper for the chat-widget message (issue #31).
 * No Vue/i18n/state dependencies — directly unit-testable. The widget component
 * passes the localized «прописью» label and the capitalise-toggle state; this
 * builds the lines that get inserted into the chat.
 */
import { rublesAmountInWords } from './numberToWords'
import { capitalizeFirst } from './formatters'

/** Minimal currency row shape the message builder needs. */
export interface MessageRow {
  code: string
  value: number | undefined
}

/** Ruble currencies with a meaningful "amount in words": BYN (base) and RUB. */
export const WORDS_CURRENCIES = ['BYN', 'RUB'] as const

/**
 * Builds the «прописью» lines inserted into the chat — one per ruble currency
 * (BYN, RUB) that currently has a numeric value, e.g.
 * "BYN прописью: сто рублей 00 копеек". `inWordsLabel` is the localized word
 * ("прописью"/"in words"); `capitalize` mirrors the widget's аб/Аб toggle.
 *
 * @returns one line per ruble row with a value; `[]` when neither has one.
 */
export function buildWordsLines(
  rows: readonly MessageRow[],
  inWordsLabel: string,
  capitalize: boolean
): string[] {
  const lines: string[] = []
  for (const code of WORDS_CURRENCIES) {
    const row = rows.find(r => r.code === code)
    if (!row || typeof row.value !== 'number') continue
    const words = rublesAmountInWords(row.value)
    lines.push(`${code} ${inWordsLabel}: ${capitalize ? capitalizeFirst(words) : words}`)
  }
  return lines
}
