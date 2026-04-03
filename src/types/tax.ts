import type { TransactionCategory } from './transaction'

// ─── Tax Year Config ──────────────────────────────────────────────────────────

/**
 * A single HMRC mileage rate band.
 * bandSizeMiles is the WIDTH of the band (not a cumulative ceiling).
 * null means unlimited — used for the last band.
 */
export interface MileageBand {
  bandSizeMiles: number | null
  ratePerMile: number
}

/** All year-specific tax constants. Add a new entry per tax year — nothing else changes. */
export interface TaxYearConfig {
  year: string
  /** ISO date string "YYYY-MM-DD" — inclusive start of the tax year */
  startDate: string
  /** ISO date string "YYYY-MM-DD" — inclusive end of the tax year */
  endDate: string
  mileageRates: MileageBand[]
}

// ─── Calculator Inputs ────────────────────────────────────────────────────────

/** Minimal shape the calculator needs from each transaction. */
export interface ApprovedTransaction {
  amount: number
  category: TransactionCategory
  date: string
}

// ─── Vehicle Deduction ────────────────────────────────────────────────────────

export type VehicleMethod = 'actual' | 'mileage'

/** One band's contribution to the total mileage allowance — used for display. */
export interface MileageBandUsage {
  miles: number
  ratePerMile: number
  amount: number
}

export interface VehicleDeduction {
  actualCosts: number
  /** null when no mileage figure was provided */
  mileageAllowance: number | null
  /** Per-band breakdown of the mileage allowance, for display only */
  mileageBandBreakdown: MileageBandUsage[] | null
  businessMiles: number | null
  chosenMethod: VehicleMethod
  chosenAmount: number
  /** Absolute difference between the two methods. null when no mileage was provided. */
  saving: number | null
}

// ─── Expense Line Item ────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  category: TransactionCategory
  label: string
  amount: number
  count: number
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────

export interface TaxSummary {
  taxYear: string

  // Income
  turnover: number
  incomeCount: number

  // Expenses
  /** Non-vehicle allowable expenses, sorted largest first */
  nonVehicleExpenses: ExpenseLineItem[]
  totalNonVehicleExpenses: number

  // Vehicle
  vehicle: VehicleDeduction

  // Totals
  /** totalNonVehicleExpenses + vehicle.chosenAmount */
  totalAllowableExpenses: number
  /** turnover − totalAllowableExpenses */
  netProfit: number

  // Meta
  approvedTransactionCount: number
  /** Transactions present in the tax year but excluded because they are still flagged */
  flaggedTransactionCount: number
}
