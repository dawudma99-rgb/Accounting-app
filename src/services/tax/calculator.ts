import type {
  ApprovedTransaction,
  IncomeTaxBand,
  MileageBandUsage,
  TaxBandResult,
  TaxLiability,
  TaxSummary,
  TaxYearConfig,
  VehicleDeduction,
} from '@/types/tax'
import type { TransactionCategory } from '@/types/transaction'
import { SA103_EXPENSE_CONFIG } from './sa103'

// ─── Mileage helpers ──────────────────────────────────────────────────────────

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

  const breakdown    = buildMileageBandBreakdown(businessMiles, config)
  const mileageTotal = breakdown.reduce((sum, b) => sum + b.amount, 0)
  const useMileage   = mileageTotal > actualCosts

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

// ─── Income tax helpers ───────────────────────────────────────────────────────

/**
 * Apply the personal allowance taper for incomes above the threshold.
 * Allowance reduces by £1 for every £2 of income above the threshold,
 * down to a minimum of £0.
 */
function effectivePersonalAllowance(
  totalIncome: number,
  config: TaxYearConfig,
): number {
  const { personalAllowance, taperThreshold } = config.incomeTax
  if (totalIncome <= taperThreshold) return personalAllowance
  const reduction = Math.floor((totalIncome - taperThreshold) / 2)
  return Math.max(0, personalAllowance - reduction)
}

/**
 * Walk the income tax bands and compute the tax due on the given amount
 * of taxable income (i.e. income already reduced by personal allowance).
 */
function applyIncomeTaxBands(
  taxableIncome: number,
  bands: IncomeTaxBand[],
): TaxBandResult[] {
  return bands
    .map((band) => {
      const upper         = band.to ?? Infinity
      const taxableInBand = Math.max(0, Math.min(taxableIncome, upper) - band.from)
      return {
        label:         band.label,
        rate:          band.rate,
        taxableAmount: taxableInBand,
        taxDue:        taxableInBand * band.rate,
      }
    })
    .filter((b) => b.taxableAmount > 0)
}

// ─── NI Class 4 helper ────────────────────────────────────────────────────────

function calculateNiClass4(
  profit: number,
  config: TaxYearConfig,
): { lower: number; upper: number } {
  const { lowerProfitsLimit, upperProfitsLimit, lowerRate, upperRate } =
    config.nationalInsurance.class4

  const lower = Math.max(0, Math.min(profit, upperProfitsLimit) - lowerProfitsLimit) * lowerRate
  const upper = Math.max(0, profit - upperProfitsLimit) * upperRate

  return { lower: Math.max(0, lower), upper: Math.max(0, upper) }
}

// ─── Tax liability calculator ─────────────────────────────────────────────────

function calculateTaxLiability(
  netProfit: number,
  config: TaxYearConfig,
  otherIncome: number,
): TaxLiability {
  const totalIncome        = netProfit + otherIncome
  const personalAllowance  = config.incomeTax.personalAllowance
  const effectivePA        = effectivePersonalAllowance(totalIncome, config)
  const taxableIncome      = Math.max(0, totalIncome - effectivePA)

  const incomeTaxBands     = applyIncomeTaxBands(taxableIncome, config.incomeTax.bands)
  const totalIncomeTax     = incomeTaxBands.reduce((sum, b) => sum + b.taxDue, 0)

  const { lower: niClass4Lower, upper: niClass4Upper } =
    calculateNiClass4(netProfit, config)
  const totalNiClass4 = niClass4Lower + niClass4Upper

  const { class2 }      = config.nationalInsurance
  const niClass2Secured = netProfit >= class2.smallProfitsThreshold
  const niClass2Annual  = class2.weeklyRate * class2.weeksInYear

  // Class 2 is not included in the cash liability — it has not been a
  // mandatory payment since April 2024. It is shown in the UI as informational.
  const totalLiability = totalIncomeTax + totalNiClass4

  const { onAccountThreshold, januaryDate, julyDate } = config.payments
  const requiresPaymentOnAccount = totalLiability > onAccountThreshold
  const januaryPayment = requiresPaymentOnAccount
    ? totalLiability / 2
    : totalLiability
  const julyPayment = requiresPaymentOnAccount
    ? totalLiability / 2
    : 0

  const afterTaxProfit   = netProfit - totalLiability
  const effectiveTaxRate = netProfit > 0 ? (totalLiability / netProfit) * 100 : 0

  return {
    netProfit,
    otherIncome,
    totalIncome,
    personalAllowance,
    effectivePersonalAllowance: effectivePA,
    taxableIncome,
    incomeTaxBands,
    totalIncomeTax,
    niClass4Lower,
    niClass4Upper,
    totalNiClass4,
    niClass2Secured,
    niClass2Annual,
    totalLiability,
    requiresPaymentOnAccount,
    januaryPayment,
    julyPayment,
    januaryDate,
    julyDate,
    afterTaxProfit,
    effectiveTaxRate,
  }
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export interface CalculatorOptions {
  businessMiles?: number
  otherIncome?: number
  flaggedTransactionCount?: number
  outOfRangeTransactionCount?: number
}

/**
 * Pure function. No I/O, no side effects.
 *
 * Takes an array of approved transactions already filtered to the correct
 * tax year, plus the year config and optional inputs (mileage, other income).
 * Returns a fully computed TaxSummary including profit figures and full
 * income tax + NI liability.
 */
export function calculateTaxSummary(
  transactions: ApprovedTransaction[],
  config: TaxYearConfig,
  options: CalculatorOptions = {},
): TaxSummary {
  const {
    businessMiles,
    otherIncome             = 0,
    flaggedTransactionCount  = 0,
    outOfRangeTransactionCount = 0,
  } = options

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
    .sort((a, b) => b.amount - a.amount)

  const totalNonVehicleExpenses = nonVehicleExpenses.reduce((sum, e) => sum + e.amount, 0)

  // ── Vehicle deduction ─────────────────────────────────────────────────────
  const vehicle = resolveVehicleDeduction(
    actualVehicleCosts,
    businessMiles ?? null,
    config,
  )

  // ── Profit ────────────────────────────────────────────────────────────────
  const totalAllowableExpenses = totalNonVehicleExpenses + vehicle.chosenAmount
  const netProfit              = turnover - totalAllowableExpenses

  // ── Tax liability ─────────────────────────────────────────────────────────
  const liability = calculateTaxLiability(netProfit, config, otherIncome)

  return {
    taxYear: config.year,

    turnover,
    incomeCount: incomeRows.length,

    nonVehicleExpenses,
    totalNonVehicleExpenses,

    vehicle,

    totalAllowableExpenses,
    netProfit,

    liability,

    approvedTransactionCount:   transactions.length,
    flaggedTransactionCount,
    outOfRangeTransactionCount,
  }
}
