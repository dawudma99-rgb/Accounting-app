import type { TransactionCategory } from '@/types/transaction'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportRow {
  date:        string
  description: string
  amount:      number
  category:    TransactionCategory
  matchedTo:   string   // platform sourceLabel, or "Unmatched", or "WARNING: …"
  confidence:  number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wrap a field in double-quotes if it contains a comma, double-quote, or
 * newline. Existing double-quotes are escaped by doubling ("").
 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ─── Public API ───────────────────────────────────────────────────────────────

const HEADERS = ['Date', 'Description', 'Amount', 'Category', 'Matched To', 'Confidence']

/**
 * Serialise an array of export rows into a UTF-8 CSV string.
 *
 * Row order is preserved. Unmatched platform payout warning rows should be
 * appended by the caller after the bank transaction rows.
 *
 * @param rows  Merged bank + match data ready for export
 * @returns     CSV string including header row, suitable for a .csv download
 */
export function serialiseToCsv(rows: ExportRow[]): string {
  const lines: string[] = [HEADERS.join(',')]

  for (const row of rows) {
    lines.push([
      escapeField(row.date),
      escapeField(row.description),
      row.amount.toFixed(2),
      escapeField(row.category),
      escapeField(row.matchedTo),
      String(row.confidence),
    ].join(','))
  }

  return lines.join('\n')
}
