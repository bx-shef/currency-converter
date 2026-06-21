/**
 * Pure helpers for the chat-widget message (issue #31).
 * No Vue/i18n/state dependencies — directly unit-testable. The widget component
 * wraps these with a localized header and the sum-in-words line.
 */
import { formatPlainAmount } from './formatters'

/** Minimal currency row shape the message builder needs. */
export interface MessageRow {
  code: string
  value: number | undefined
}

/**
 * Builds "100.00 USD = 287.50 BYN" lines anchored on the active currency — one
 * per other currency that currently has a numeric value. Plain numbers (dot, two
 * decimals, no grouping) so the text pastes cleanly into a chat.
 *
 * @returns one line per convertible row; `[]` when the active row is missing or
 *   has no numeric value (nothing meaningful to insert).
 */
export function buildConversionLines(rows: readonly MessageRow[], activeCode: string): string[] {
  const active = rows.find(r => r.code === activeCode)
  if (!active || typeof active.value !== 'number') return []

  const lines: string[] = []
  for (const r of rows) {
    if (r.code === active.code) continue
    if (typeof r.value !== 'number') continue
    lines.push(`${formatPlainAmount(active.value)} ${active.code} = ${formatPlainAmount(r.value)} ${r.code}`)
  }
  return lines
}

/**
 * Picks the currency whose "amount in words" is worth showing: the active row
 * when it is a ruble currency (BYN/RUB), otherwise BYN (the conversion base).
 */
export function wordsCurrencyCode(activeCode: string): 'BYN' | 'RUB' {
  return activeCode === 'RUB' ? 'RUB' : 'BYN'
}
