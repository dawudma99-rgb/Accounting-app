// ─── Types ────────────────────────────────────────────────────────────────────

/** One normalised row from an Uber weekly driver statement. */
export interface UberWeeklyRow {
  /** Always 'uber' — used by the matching engine to identify the platform. */
  platform: 'uber'

  /**
   * ISO 8601 date the week ended (Sunday).
   * Source: "Week Ending" column, parsed from DD/MM/YYYY.
   */
  weekEnding: string

  /**
   * ISO 8601 date Uber transferred the net earnings to the driver's bank.
   * Source: "Transfer Date" column, parsed from DD/MM/YYYY.
   * This is the date to match against bank credits.
   */
  payoutDate: string

  /** Number of trips completed in the week. */
  tripsCompleted: number

  /**
   * Total fares charged to passengers before any deductions.
   * Source: "Gross Fares".
   */
  grossEarnings: number

  /**
   * Uber's commission / service fee deducted from gross fares.
   * Source: "Uber Service Fee". Always stored as a positive number.
   */
  serviceFee: number

  /** Driver tips paid by passengers. Source: "Tips". */
  tips: number

  /** Promotional bonuses added by Uber. Source: "Promotions". */
  promotions: number

  /** Toll charges passed through to the driver. Source: "Tolls". */
  tolls: number

  /** Airport surcharges. Source: "Airport Fees". */
  airportFees: number

  /**
   * One-off corrections applied by Uber (e.g. fare adjustments, refunds).
   * Source: "Adjustments". Can be negative.
   */
  adjustments: number

  /**
   * VAT or equivalent taxes applied on the service fee.
   * Source: "Taxes on Service Fee".
   */
  taxesOnServiceFee: number

  /**
   * Amount transferred to the driver's bank account.
   * Source: "Net Earnings".
   * Used as the primary match target against bank credits.
   */
  netEarnings: number

  /**
   * Human-readable label for UI and CSV export.
   * Format: "Uber W/E DD/MM/YYYY (N trips)"
   */
  sourceLabel: string

  /**
   * Original parsed fields keyed by header name.
   * Preserved verbatim for debugging and future schema evolution.
   */
  rawRow: Record<string, string>
}

export interface UberParseResult {
  rows: UberWeeklyRow[]
  /** Rows skipped (blank lines, unparseable values). */
  skipped: number
  /** Non-fatal warnings describing each skipped row. */
  warnings: string[]
}

// ─── Expected headers ─────────────────────────────────────────────────────────

const EXPECTED_HEADERS = [
  'Week Ending',
  'Trips Completed',
  'Gross Fares',
  'Net Earnings',
  'Transfer Date',
] as const

// ─── Field parsers ────────────────────────────────────────────────────────────

/**
 * Convert DD/MM/YYYY → ISO 8601 YYYY-MM-DD.
 * Does not use the Date constructor to avoid timezone shifts.
 */
function parseDate(raw: string, field: string): string {
  const parts = raw.trim().split('/')
  if (parts.length !== 3) {
    throw new Error(`"${field}" has unrecognised date format: "${raw}"`)
  }
  const [dd, mm, yyyy] = parts
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) {
    throw new Error(`"${field}" has unrecognised date format: "${raw}"`)
  }
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Parse a numeric currency or count field.
 * Blank or whitespace-only values default to 0 as required.
 */
function parseNumber(raw: string, field: string): number {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-') return 0
  const n = parseFloat(trimmed)
  if (!isFinite(n)) throw new Error(`"${field}" is not a valid number: "${raw}"`)
  return n
}

/**
 * Format a DD/MM/YYYY date string for use in sourceLabel.
 * Returns the raw value unchanged — it is already in the desired display format.
 */
function displayDate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-')
  return `${dd}/${mm}/${yyyy}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse the text content of an Uber weekly driver statement CSV into normalised
 * UberWeeklyRow objects ready for the platform matching engine.
 *
 * Expected CSV shape (one data row per week):
 *   Week Ending, Trips Completed, Gross Fares, Promotions, Tips, Tolls,
 *   Airport Fees, Adjustments, Uber Service Fee, Taxes on Service Fee,
 *   Net Earnings, Transfer Date
 *
 * Resilience:
 *   - Blank numeric cells → 0
 *   - Leading/trailing whitespace stripped from every cell
 *   - Rows with unparseable dates or amounts are skipped with a warning
 *   - Rows with net earnings of 0 are skipped (void/cancelled weeks)
 *
 * @param csv  Raw UTF-8 text of the Uber statement .csv file
 * @throws     If the file does not contain the expected Uber headers
 */
export function parseUberCSV(csv: string): UberParseResult {
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length === 0) {
    return { rows: [], skipped: 0, warnings: ['File is empty'] }
  }

  // Parse header row and validate
  const headers = lines[0].split(',').map((h) => h.trim())
  const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new Error(
      `This does not look like an Uber weekly statement. ` +
      `Missing columns: ${missing.join(', ')}`
    )
  }

  // Build index map so column order changes don't break the parser
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))

  const rows: UberWeeklyRow[] = []
  const warnings: string[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',').map((f) => f.trim())
    const lineNum = i + 1

    // Build raw row for debugging before attempting any parsing
    const rawRow: Record<string, string> = {}
    for (const header of headers) {
      rawRow[header] = fields[idx[header]] ?? ''
    }

    // Require at least as many fields as headers
    if (fields.length < headers.length) {
      warnings.push(`Row ${lineNum} skipped — too few columns (got ${fields.length}, expected ${headers.length})`)
      skipped++
      continue
    }

    let weekEnding: string
    let payoutDate: string
    let tripsCompleted: number
    let grossEarnings: number
    let promotions: number
    let tips: number
    let tolls: number
    let airportFees: number
    let adjustments: number
    let serviceFee: number
    let taxesOnServiceFee: number
    let netEarnings: number

    try {
      weekEnding        = parseDate(fields[idx['Week Ending']], 'Week Ending')
      payoutDate        = parseDate(fields[idx['Transfer Date']], 'Transfer Date')
      tripsCompleted    = parseNumber(fields[idx['Trips Completed']], 'Trips Completed')
      grossEarnings     = parseNumber(fields[idx['Gross Fares']], 'Gross Fares')
      promotions        = parseNumber(fields[idx['Promotions']], 'Promotions')
      tips              = parseNumber(fields[idx['Tips']], 'Tips')
      tolls             = parseNumber(fields[idx['Tolls']], 'Tolls')
      airportFees       = parseNumber(fields[idx['Airport Fees']], 'Airport Fees')
      adjustments       = parseNumber(fields[idx['Adjustments']], 'Adjustments')
      serviceFee        = parseNumber(fields[idx['Uber Service Fee']], 'Uber Service Fee')
      taxesOnServiceFee = parseNumber(fields[idx['Taxes on Service Fee']], 'Taxes on Service Fee')
      netEarnings       = parseNumber(fields[idx['Net Earnings']], 'Net Earnings')
    } catch (err) {
      warnings.push(`Row ${lineNum} skipped — ${(err as Error).message}`)
      skipped++
      continue
    }

    // Skip void/cancelled weeks with no net transfer
    if (netEarnings === 0) {
      skipped++
      continue
    }

    const sourceLabel =
      `Uber W/E ${displayDate(weekEnding)} (${tripsCompleted} trip${tripsCompleted !== 1 ? 's' : ''})`

    rows.push({
      platform: 'uber',
      weekEnding,
      payoutDate,
      tripsCompleted,
      grossEarnings,
      serviceFee,
      tips,
      promotions,
      tolls,
      airportFees,
      adjustments,
      taxesOnServiceFee,
      netEarnings,
      sourceLabel,
      rawRow,
    })
  }

  return { rows, skipped, warnings }
}
