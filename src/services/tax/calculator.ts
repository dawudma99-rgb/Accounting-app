import type {
  ApprovedTransaction,
  MileageBandUsage,
  TaxSummary,
  TaxYearConfig,
  VehicleDeduction,
} from '@/types/tax'
import type { TransactionCategory } from '@/types/transaction'
import { SA103_EXPENSE_CONFIG } from './sa103'

// ─── Mileage helpers ──────────────────────────────────────────────────────────

/**
 * Walk the configured mileage bands and return the total allowance for the
 * given number of business miles.
 *
 * Bands are consumed in order. Each band has a width (bandSizeMiles); the
 * final band (bandSizeMiles === null) absorbs all remaining miles.
 */
function buildMileageBandBreakdown(
  miles: number,
  config: TaxYearConfig,
): MileageBandUsage[] {
  const breakdown: MileageBandUsage[] = []
  let remaining = miles

  for (const band of config.mileageRates) {
    if (remaining <= 0) break

    const milesInBand =
      band.bandSizeMiles !== null
        ? Math.min(remaining, band.bandSizeMiles)
        : remaining

    breakdown.push({
      miles:       milesInBand,
      ratePerMile: band.ratePerMile,
      amount:      milesInBand * band.ratePerMile,
    })

    remaining -= milesInBand
  }

  return breakdown
}

function sumMileageBreakdown(breakdown: MileageBandUsage[]): number {
  return breakdown.reduce((total, b) => total + b.amount, 0)
}

// ─── Vehicle deduction resolver ───────────────────────────────────────────────

function resolveVehicleDeduction(
  actualCosts: number,
  businessMiles: number | null,
  config: TaxYearConfig,
): VehicleDeduction {
  if (businessMiles === null) {
    return {
      actualCosts,
      mileageAllowance:     null,
      mileageBandBreakdown: null,
      businessMiles:        null,
      chosenMethod:         'actual',
      chosenAmount:         actualCosts,
      saving:               null,
    }
  }

  const breakdown      = buildMileageBandBreakdown(businessMiles, config)
  const mileageTotal   = sumMileageBreakdown(breakdown)
  const useMileage     = mileageTotal > actualCosts

  return {
    actualCosts,
    mileageAllowance:     mileageTotal,
    mileageBandBreakdown: breakdown,
    businessMiles,
    chosenMethod:         useMileage ? 'mileage' : 'actual',
    chosenAmount:         useMileage ? mileageTotal : actualCosts,
    saving:               Math.abs(mileageTotal - actualCosts),
  }
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export interface CalculatorOptions {
  businessMiles?: number
  /** Number of flagged transactions excluded by the caller — stored for display only */
  flaggedTransactionCount?: number
}

/**
 * Pure function. Takes an array of approved transactions and returns a fully
 * computed TaxSummary. No I/O, no side effects.
 *
 * @param transactions  Approved transactions filtered to the correct tax year.
 * @param config        Tax year config from src/config/taxYears.ts.
 * @param options       Optional mileage figure and flagged count metadata.
 */
export function calculateTaxSummary(
  transactions: ApprovedTransaction[],
  config: TaxYearConfig,
  options: CalculatorOptions = {},
): TaxSummary {
  const { businessMiles, flaggedTransactionCount = 0 } = options

  // ── Turnover ──────────────────────────────────────────────────────────────
  const incomeRows = transactions.filter((t) => t.amount > 0)
  const turnover   = incomeRows.reduce((sum, t) => sum + t.amount, 0)

  // ── Aggregate expenses by category ───────────────────────────────────────
  const expenseRows = transactions.filter((t) => t.amount < 0)

  const categoryTotals = new Map<TransactionCategory, { amount: number; count: number }>()
  for (const t of expenseRows) {
    const cat   = t.category
    const entry = categoryTotals.get(cat) ?? { amount: 0, count: 0 }
    entry.amount += Math.abs(t.amount)
    entry.count  += 1
    categoryTotals.set(cat, entry)
  }

  // ── Split vehicle vs non-vehicle ──────────────────────────────────────────
  const actualVehicleCosts = categoryTotals.get('fuel')?.amount ?? 0

  const nonVehicleExpenses = Object
    .entries(SA103_EXPENSE_CONFIG)
    .filter(([, cfg]) => !cfg!.isVehicle)
    .flatMap(([category, cfg]) => {
      const totals = categoryTotals.get(category as TransactionCategory)
      if (!totals) return []
      return [{
        category: category as TransactionCategory,
        label:    cfg!.label,
        amount:   totals.amount,
        count:    totals.count,
      }]
    })
    .sort((a, b) => b.amount - a.amount) // largest first

  const totalNonVehicleExpenses = nonVehicleExpenses.reduce((sum, e) => sum + e.amount, 0)

  // ── Vehicle deduction ─────────────────────────────────────────────────────
  const vehicle = resolveVehicleDeduction(
    actualVehicleCosts,
    businessMiles ?? null,
    config,
  )

  // ── Final totals ──────────────────────────────────────────────────────────
  const totalAllowableExpenses = totalNonVehicleExpenses + vehicle.chosenAmount
  const netProfit              = turnover - totalAllowableExpenses

  return {
    taxYear: config.year,

    turnover,
    incomeCount: incomeRows.length,

    nonVehicleExpenses,
    totalNonVehicleExpenses,

    vehicle,

    totalAllowableExpenses,
    netProfit,

    approvedTransactionCount: transactions.length,
    flaggedTransactionCount,
  }
}
