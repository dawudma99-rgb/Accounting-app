// ─── SA103 Draft Types ────────────────────────────────────────────────────────
//
// These types represent the output of the SA103 draft generator — a structured
// mapping of the completed bookkeeping and profit calculation into the fields
// an accountant needs to review before filing the self-employment return.
//
// SA103S (short form): turnover ≤ SA103S threshold — expenses as a single total
// SA103F (full form):  turnover >  SA103S threshold — individual expense lines required

export type SA103FormVersion = 'SA103S' | 'SA103F'

export type SA103FlagSeverity = 'action' | 'warning' | 'info'

/** An accountant-facing note generated automatically from the bookkeeping data. */
export interface SA103Flag {
  severity: SA103FlagSeverity
  /** Short label used for the icon / badge */
  label: string
  /** Full descriptive message */
  message: string
}

/** One line item in the allowable expenses section. */
export interface SA103ExpenseLine {
  /** HMRC field description */
  hmrcLabel: string
  amount: number
}

/** The vehicle expense line — shown separately because the method matters for filing. */
export interface SA103VehicleLine {
  hmrcLabel: 'Motor expenses'
  method: 'actual' | 'mileage'
  amount: number
  /** Human-readable explanation of the method and figures for the accountant */
  methodNote: string
}

/**
 * A complete SA103 draft generated from a finished client year pack.
 * All figures are ready for the accountant to sense-check before the main
 * tax return summary is produced.
 */
export interface SA103Draft {
  // ── Header ───────────────────────────────────────────────────────────────
  taxYear: string
  formVersion: SA103FormVersion
  clientName: string
  /** 10-digit UTR. null if not yet recorded on the client record. */
  utr: string | null
  businessDescription: string
  /** ISO date the draft was generated — for version tracking */
  generatedDate: string

  // ── Business income ───────────────────────────────────────────────────────
  turnover: number
  /** Not yet captured by the bookkeeping engine — surfaced as zero with a flag */
  otherBusinessIncome: number
  totalBusinessIncome: number

  // ── Allowable expenses ────────────────────────────────────────────────────
  /** Non-vehicle expense lines, sorted largest first */
  expenseLines: SA103ExpenseLine[]
  vehicleLine: SA103VehicleLine
  totalAllowableExpenses: number

  // ── Profit / loss ─────────────────────────────────────────────────────────
  netProfit: number
  isLoss: boolean
  /** Same as netProfit for a standard sole trader with no further adjustments */
  taxableProfitForSA100: number

  // ── Accountant flags ──────────────────────────────────────────────────────
  /** Items the accountant must review or act on before filing. */
  flags: SA103Flag[]
  /** True if any 'action' severity flags are present */
  hasBlockingFlags: boolean
}
