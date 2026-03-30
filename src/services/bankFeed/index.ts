import type { Transaction } from '@/types/transaction'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParseResult {
  transactions: Transaction[]
  /** Rows skipped — header, blanks, zero-amount, unparseable */
  skipped: number
  /** Non-fatal warnings describing skipped rows */
  warnings: string[]
}

// ─── Monzo column indices ─────────────────────────────────────────────────────
//
// Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,
// Local amount,Local currency,Notes and #tags,Address,Receipt,Description,
// Category split,Money Out,Money In

const COL = {
  date:        1,
  name:        4,  // Monzo display label e.g. "Tesco"
  amount:      7,
  description: 14, // full bank text e.g. "TESCO STORES 2495 MANCHESTER GBR"
} as const

const EXPECTED_HEADERS = ['Transaction ID', 'Date', 'Time', 'Type', 'Name']

// ─── CSV row parser ───────────────────────────────────────────────────────────

/**
 * Split one CSV line into fields, correctly handling:
 * - Quoted fields that contain commas
 * - Escaped double-quotes within quoted fields ("")
 * - Emoji characters (present in Monzo's Emoji column)
 */
function parseRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ─── Field parsers ────────────────────────────────────────────────────────────

/**
 * Convert Monzo date format DD/MM/YYYY → ISO 8601 YYYY-MM-DD.
 * Does not use the Date constructor to avoid timezone shifts.
 */
function parseDate(raw: string): string {
  const parts = raw.trim().split('/')
  if (parts.length !== 3) {
    throw new Error(`Unrecognised date format: "${raw}"`)
  }
  const [dd, mm, yyyy] = parts
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.trim())
  if (!isFinite(n)) throw new Error(`Unrecognised amount: "${raw}"`)
  return n
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse the text content of a Monzo CSV export into normalised Transaction
 * objects ready for the categorisation engine.
 *
 * Column usage:
 *   Description (col 14) → transaction.description  (full bank text, best for AI)
 *   Name        (col 4)  → transaction.merchant      (clean display label for UI)
 *   Amount      (col 7)  → transaction.amount        (always GBP — Monzo pre-converts)
 *   Date        (col 1)  → transaction.date          (converted to ISO 8601)
 *
 * Rows skipped:
 *   - The header row
 *   - Rows with fewer than 15 fields
 *   - Rows with a missing or zero amount (declined txns, pot transfers, placeholders)
 *   - Rows where date or amount cannot be parsed (logged as warnings)
 *
 * @param csv  Raw UTF-8 text of the exported .csv file
 * @throws     If the file does not look like a Monzo export (wrong headers)
 */
export function parseMonzoCSV(csv: string): ParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length === 0) {
    return { transactions: [], skipped: 0, warnings: ['File is empty'] }
  }

  const headers = parseRow(lines[0])
  const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `This does not look like a Monzo CSV export. ` +
      `Missing headers: ${missing.join(', ')}`
    )
  }

  const transactions: Transaction[] = []
  const warnings: string[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = parseRow(lines[i])

    if (fields.length < 15) {
      skipped++
      continue
    }

    const rawAmount   = fields[COL.amount].trim()
    const rawDate     = fields[COL.date].trim()
    const description = fields[COL.description].trim()
    const name        = fields[COL.name].trim()

    if (!rawAmount) {
      skipped++
      continue
    }

    let amount: number
    let date: string

    try {
      amount = parseAmount(rawAmount)
      date   = parseDate(rawDate)
    } catch (err) {
      warnings.push(`Row ${i + 1} skipped — ${(err as Error).message}`)
      skipped++
      continue
    }

    if (amount === 0) {
      skipped++
      continue
    }

    transactions.push({
      description: description || name,
      amount,
      date,
      merchant: name || undefined,
    })
  }

  return { transactions, skipped, warnings }
}
