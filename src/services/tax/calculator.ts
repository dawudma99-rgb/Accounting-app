import type {
  ApprovedTransaction,
  CapitalAllowanceResult,
  IncomeTaxBand,
  MileageBandUsage,
  MtdQuarterInput,
  MtdYtdResult,
  StudentLoanPlan,
  StudentLoanRepayment,
  TaxBandResult,
  TaxLiability,
  TaxSummary,
  TaxYearConfig,
  VehicleDeduction,
  VehicleMethod,
} from '@/types/tax'
import type { TransactionCategory } from '@/types/transaction'
import { SA103_EXPENSE_CONFIG } from './sa103'

// ─── Mileage (C-06 to C-09) ───────────────────────────────────────────────────

function buildMileageBandBreakdown(
  miles: number,
  config: TaxYearConfig,
): MileageBandUsage[] {
  const breakdown: MileageBandUsage[] = []
  let remaining = miles

  for (const band of config.mileageRates) {
    if (remaining <= 0) break
    const milesInBand = band.bandSizeMiles !== null
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

function calcMileageAllowance(miles: number, config: TaxYearConfig): number {
  return buildMileageBandBreakdown(miles, config).reduce((s, b) => s + b.amount, 0)
}

// ─── Capital allowance (C-12 to C-17) ────────────────────────────────────────

/**
 * Determine WDA rate from CO2 emissions.
 * 0g = EV → 100% FYA
 * 1–50g = special rate pool → 6%
 * 51g+ = main rate pool → 18%
 */
export function wdaRateFromCO2(co2Gkm: number): number {
  if (co2Gkm === 0)  return 1.00  // EV — 100% FYA
  if (co2Gkm <= 50)  return 0.06  // special rate pool
  return 0.18                      // main rate pool
}

function calcCapitalAllowance(opts: {
  openingPool:        number
  additions:          number
  wdaRate:            number
  businessUsePct:     number  // 0–1
  disposalProceeds?:  number
  isDisposalYear?:    boolean
}): CapitalAllowanceResult {
  const { openingPool, additions, wdaRate, businessUsePct } = opts
  const isEV = wdaRate === 1.00

  const poolBeforeWDA = openingPool + additions
  const wdaGross      = poolBeforeWDA * wdaRate
  const privateUseRestriction = wdaGross * (1 - businessUsePct)
  const allowableWDA  = wdaGross * businessUsePct

  let closingPool        = poolBeforeWDA - wdaGross
  let balancingAllowance = 0
  let balancingCharge    = 0

  if (opts.isDisposalYear && opts.disposalProceeds !== undefined) {
    const proceeds = opts.disposalProceeds
    if (proceeds < closingPool) {
      // C-16: balancing allowance — pool exceeds proceeds
      balancingAllowance = (closingPool - proceeds) * businessUsePct
      closingPool = 0
    } else if (proceeds > closingPool) {
      // C-17: balancing charge — proceeds exceed pool (taxable)
      balancingCharge = (proceeds - closingPool) * businessUsePct
      closingPool = 0
    } else {
      closingPool = 0
    }
  }

  return {
    openingPool,
    additions,
    wdaRate,
    wdaGross,
    privateUseRestriction,
    allowableWDA,
    closingPool: Math.max(0, closingPool),
    balancingAllowance,
    balancingCharge,
    isEV,
  }
}

// ─── Vehicle deduction resolver ───────────────────────────────────────────────

function resolveVehicleDeduction(opts: {
  method:             VehicleMethod
  businessMiles?:     number
  actualCostsGross?:  number
  businessUsePct?:    number
  capitalAllowance?:  CapitalAllowanceResult
  rentalCosts?:       number
  rentalFuel?:        number
  config:             TaxYearConfig
  isYearOne?:         boolean
}): VehicleDeduction {
  const { method, config } = opts
  const businessUsePct = opts.businessUsePct ?? 1

  let chosenAmount = 0
  const result: VehicleDeduction = {
    method,
    businessMiles:        null,
    mileageBandBreakdown: null,
    mileageAllowance:     null,
    actualCostsGross:     null,
    businessUsePercent:   null,
    allowableActualCosts: null,
    capitalAllowance:     null,
    rentalCosts:          null,
    rentalFuel:           null,
    allowableRentalClaim: null,
    allowableFuelClaim:   null,
    chosenAmount:         0,
    yearOneComparison:    null,
  }

  if (method === 'mileage') {
    const miles     = opts.businessMiles ?? 0
    const breakdown = buildMileageBandBreakdown(miles, config)
    const allowance = breakdown.reduce((s, b) => s + b.amount, 0)
    result.businessMiles        = miles
    result.mileageBandBreakdown = breakdown
    result.mileageAllowance     = allowance
    chosenAmount = allowance

  } else if (method === 'actual') {
    const gross     = opts.actualCostsGross ?? 0
    const allowable = gross * businessUsePct
    const ca        = opts.capitalAllowance ?? null
    const wdaAmount = ca ? ca.allowableWDA + ca.balancingAllowance - ca.balancingCharge : 0

    result.actualCostsGross     = gross
    result.businessUsePercent   = businessUsePct
    result.allowableActualCosts = allowable
    result.capitalAllowance     = ca
    chosenAmount = allowable + wdaAmount

    // C-18: year one comparison
    if (opts.isYearOne && opts.businessMiles !== undefined) {
      const mileageClaim  = calcMileageAllowance(opts.businessMiles, config)
      const actualPlusWDA = chosenAmount
      result.yearOneComparison = {
        mileageClaim,
        actualPlusWDA,
        recommendedMethod: mileageClaim >= actualPlusWDA ? 'mileage' : 'actual',
        saving: Math.abs(mileageClaim - actualPlusWDA),
      }
    }

  } else if (method === 'rental') {
    const rental         = opts.rentalCosts ?? 0
    const fuel           = opts.rentalFuel  ?? 0
    const allowableRental = rental * businessUsePct
    const allowableFuel  = fuel   * businessUsePct

    result.rentalCosts          = rental
    result.rentalFuel           = fuel
    result.businessUsePercent   = businessUsePct
    result.allowableRentalClaim = allowableRental
    result.allowableFuelClaim   = allowableFuel
    chosenAmount = allowableRental + allowableFuel
  }

  result.chosenAmount = chosenAmount
  return result
}

// ─── Personal allowance taper (C-30) ─────────────────────────────────────────

function effectivePersonalAllowance(totalIncome: number, config: TaxYearConfig): number {
  const { personalAllowance, taperThreshold } = config.incomeTax
  if (totalIncome <= taperThreshold) return personalAllowance
  const reduction = Math.floor((totalIncome - taperThreshold) / 2)
  return Math.max(0, personalAllowance - reduction)
}

// ─── Income tax bands (C-32 to C-35) ─────────────────────────────────────────

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

// ─── Class 4 NICs (C-37 to C-39) ─────────────────────────────────────────────

function calcNiClass4(
  profit: number,
  config: TaxYearConfig,
): { lower: number; upper: number } {
  const { lowerProfitsLimit, upperProfitsLimit, lowerRate, upperRate } =
    config.nationalInsurance.class4

  return {
    lower: Math.max(0, Math.min(profit, upperProfitsLimit) - lowerProfitsLimit) * lowerRate,
    upper: Math.max(0, profit - upperProfitsLimit) * upperRate,
  }
}

// ─── Student loan (C-40 to C-44) ─────────────────────────────────────────────

function calcStudentLoans(
  taxableProfit: number,
  activePlans: StudentLoanPlan[],
  config: TaxYearConfig,
): StudentLoanRepayment[] {
  return activePlans.map((plan) => {
    const planConfig = config.studentLoans[plan]
    const repayment  = Math.max(0, taxableProfit - planConfig.threshold) * planConfig.rate
    return {
      plan,
      threshold: planConfig.threshold,
      rate:      planConfig.rate,
      repayment,
    }
  })
}

// ─── Full liability (C-29 to C-50) ───────────────────────────────────────────

function calcTaxLiability(opts: {
  taxableProfit:    number
  otherIncome:      number
  activePlans:      StudentLoanPlan[]
  poa1Paid:         number
  poa2Paid:         number
  sa303Elected:     boolean
  sa303Amount?:     number
  config:           TaxYearConfig
}): TaxLiability {
  const { taxableProfit, otherIncome, config } = opts

  // C-29: adjusted net income
  const adjustedNetIncome = taxableProfit + otherIncome

  // C-30: personal allowance with taper
  const personalAllowance  = config.incomeTax.personalAllowance
  const effectivePA        = effectivePersonalAllowance(adjustedNetIncome, config)

  // C-31: taxable income
  const taxableIncome = Math.max(0, adjustedNetIncome - effectivePA)

  // C-32 to C-35: income tax
  const incomeTaxBands = applyIncomeTaxBands(taxableIncome, config.incomeTax.bands)
  const totalIncomeTax = incomeTaxBands.reduce((s, b) => s + b.taxDue, 0)

  // C-36: Class 2 (informational only — abolished April 2024)
  const { class2 } = config.nationalInsurance
  const niClass2Secured = taxableProfit >= class2.smallProfitsThreshold
  const niClass2Annual  = class2.weeklyRate * class2.weeksInYear

  // C-37 to C-39: Class 4
  const { lower: niClass4Lower, upper: niClass4Upper } = calcNiClass4(taxableProfit, config)
  const totalNiClass4 = niClass4Lower + niClass4Upper

  // C-40 to C-44: student loan
  const studentLoanBreakdown = calcStudentLoans(taxableProfit, opts.activePlans, config)
  const totalStudentLoan     = studentLoanBreakdown.reduce((s, r) => s + r.repayment, 0)

  // C-45: total liability (IT + NIC + SL)
  const totalLiability = totalIncomeTax + totalNiClass4 + totalStudentLoan

  // C-46: POA per payment (50%)
  const { onAccountThreshold, januaryDate, julyDate } = config.payments
  const requiresPaymentOnAccount = totalLiability > onAccountThreshold
  const poaPerPayment = requiresPaymentOnAccount ? totalLiability / 2 : 0

  // C-50: SA303 POA reduction
  const sa303ReducedAmount = opts.sa303Elected && opts.sa303Amount !== undefined
    ? Math.min(opts.sa303Amount, poaPerPayment)
    : null
  const effectivePoaAmount = sa303ReducedAmount ?? poaPerPayment

  // C-47: balancing payment = this year's liability − prior year POA already paid
  const priorPoaPaid    = opts.poa1Paid + opts.poa2Paid
  const balancingPayment = Math.max(0, totalLiability - priorPoaPaid)

  // C-48: total due 31 January = balancing payment + first POA for next year
  const januaryTotal = balancingPayment + effectivePoaAmount

  // C-49: total due 31 July = second POA for next year
  const julyTotal = requiresPaymentOnAccount ? effectivePoaAmount : 0

  const afterTaxProfit   = taxableProfit - totalLiability
  const effectiveTaxRate = taxableProfit > 0 ? (totalLiability / taxableProfit) * 100 : 0

  return {
    taxableProfit,
    otherIncome,
    adjustedNetIncome,
    personalAllowance,
    effectivePersonalAllowance: effectivePA,
    taxableIncome,
    incomeTaxBands,
    totalIncomeTax,
    niClass2Secured,
    niClass2Annual,
    niClass4Lower,
    niClass4Upper,
    totalNiClass4,
    studentLoanBreakdown,
    totalStudentLoan,
    totalLiability,
    requiresPaymentOnAccount,
    poaPerPayment,
    balancingPayment,
    januaryTotal,
    julyTotal,
    januaryDate,
    julyDate,
    sa303Elected:      opts.sa303Elected,
    sa303ReducedAmount,
    effectivePoaAmount,
    afterTaxProfit,
    effectiveTaxRate,
  }
}

// ─── Calculator options ───────────────────────────────────────────────────────

export interface CalculatorOptions {
  // Vehicle — which method to use (accountant-locked after year one)
  vehicleMethod?: VehicleMethod

  // Mileage method (C-06 to C-09)
  businessMiles?: number

  // Actual costs method (C-10 to C-15)
  actualCostsGross?: number    // total vehicle costs: fuel + insurance + MOT + servicing + VED + repairs
  businessUsePct?:   number    // 0–100 (will be divided by 100 internally)

  // Capital allowance inputs (C-12 to C-17)
  openingPoolValue?:    number
  vehicleAdditions?:    number  // purchase price of vehicle added this year
  co2Gkm?:             number   // used to derive WDA rate
  wdaRate?:            number   // override if CO2 not available
  isDisposalYear?:     boolean
  disposalProceeds?:   number
  isYearOne?:          boolean  // triggers year one method comparison (C-18)

  // Rental method (C-19 to C-20)
  rentalCosts?: number
  rentalFuel?:  number

  // Phone (C-21)
  phoneBill?:            number
  phoneBusinessPct?:     number  // 0–100

  // Other income
  otherIncome?: number

  // Profit adjustments (C-25 to C-28)
  overlapRelief?:        number
  lossesBroughtForward?: number

  // Prior year POA paid (C-47)
  poa1Paid?: number
  poa2Paid?: number

  // SA303 POA reduction (C-50)
  sa303Elected?:  boolean
  sa303Amount?:   number

  // Student loan active plans (C-40 to C-44)
  studentLoanPlans?: StudentLoanPlan[]

  // Metadata for UI
  flaggedTransactionCount?:    number
  outOfRangeTransactionCount?: number
}

// ─── Main calculator (C-01 to C-50) ──────────────────────────────────────────

/**
 * Pure function — no I/O, no side effects.
 *
 * Accepts approved transactions filtered to the correct tax year, the year
 * config, and optional inputs. Returns a fully computed TaxSummary covering
 * all calculations C-01 to C-50.
 */
export function calculateTaxSummary(
  transactions: ApprovedTransaction[],
  config: TaxYearConfig,
  options: CalculatorOptions = {},
): TaxSummary {
  const {
    vehicleMethod             = 'mileage',
    businessMiles,
    actualCostsGross,
    businessUsePct            = 100,
    openingPoolValue          = 0,
    vehicleAdditions          = 0,
    co2Gkm,
    wdaRate:                  explicitWdaRate,
    isDisposalYear            = false,
    disposalProceeds,
    isYearOne                 = false,
    rentalCosts,
    rentalFuel,
    phoneBill,
    phoneBusinessPct          = 100,
    otherIncome               = 0,
    overlapRelief             = 0,
    lossesBroughtForward      = 0,
    poa1Paid                  = 0,
    poa2Paid                  = 0,
    sa303Elected               = false,
    sa303Amount,
    studentLoanPlans          = [],
    flaggedTransactionCount    = 0,
    outOfRangeTransactionCount = 0,
  } = options

  // ── C-01 to C-04: Turnover ────────────────────────────────────────────────
  const incomeRows  = transactions.filter((t) => t.amount > 0)
  const turnover    = incomeRows.reduce((s, t) => s + t.amount, 0)
  const grossTurnover = turnover + otherIncome

  // ── Aggregate expenses by category ───────────────────────────────────────
  const expenseRows = transactions.filter((t) => t.amount < 0)
  const categoryTotals = new Map<TransactionCategory, { amount: number; count: number }>()
  for (const t of expenseRows) {
    const entry = categoryTotals.get(t.category) ?? { amount: 0, count: 0 }
    entry.amount += Math.abs(t.amount)
    entry.count  += 1
    categoryTotals.set(t.category, entry)
  }

  // ── C-21: Phone claim ─────────────────────────────────────────────────────
  const phoneClaim = phoneBill ? phoneBill * (phoneBusinessPct / 100) : 0

  // ── Non-vehicle expenses ──────────────────────────────────────────────────
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

  const totalNonVehicleExpenses = nonVehicleExpenses.reduce((s, e) => s + e.amount, 0)

  // ── Capital allowance (C-12 to C-17) ─────────────────────────────────────
  let capitalAllowance = null
  if (vehicleMethod === 'actual') {
    const rate = explicitWdaRate ?? (co2Gkm !== undefined ? wdaRateFromCO2(co2Gkm) : 0.18)
    capitalAllowance = calcCapitalAllowance({
      openingPool:       openingPoolValue,
      additions:         vehicleAdditions,
      wdaRate:           rate,
      businessUsePct:    businessUsePct / 100,
      isDisposalYear,
      disposalProceeds,
    })
  }

  // ── C-10 to C-20: Vehicle deduction ──────────────────────────────────────
  const vehicle = resolveVehicleDeduction({
    method:           vehicleMethod,
    businessMiles,
    actualCostsGross,
    businessUsePct:   businessUsePct / 100,
    capitalAllowance: capitalAllowance ?? undefined,
    rentalCosts,
    rentalFuel,
    config,
    isYearOne,
  })

  // ── C-22 to C-23: Total allowable expenses ────────────────────────────────
  const totalAllowableExpenses = totalNonVehicleExpenses + vehicle.chosenAmount + phoneClaim

  // ── C-24: Net profit before adjustments ──────────────────────────────────
  const netProfitPreAdjustments = grossTurnover - totalAllowableExpenses

  // ── C-25: Deduct overlap relief ───────────────────────────────────────────
  const netProfitPostOverlap = netProfitPreAdjustments - overlapRelief

  // ── C-26 to C-28: Losses b/f and loss year ────────────────────────────────
  const isLossYear = netProfitPostOverlap < 0

  let taxableProfit              = 0
  let lossesRemainingAfterOffset = 0
  let lossesCarriedForward       = 0

  if (isLossYear) {
    // C-28: loss year — store the full loss as c/f
    taxableProfit        = 0
    lossesCarriedForward = Math.abs(netProfitPostOverlap) + lossesBroughtForward
  } else {
    // C-26: offset losses b/f against profit
    taxableProfit              = Math.max(0, netProfitPostOverlap - lossesBroughtForward)
    // C-27: store any remaining losses
    lossesRemainingAfterOffset = Math.max(0, lossesBroughtForward - netProfitPostOverlap)
    lossesCarriedForward       = lossesRemainingAfterOffset
  }

  // ── C-29 to C-50: Full liability ──────────────────────────────────────────
  const liability = calcTaxLiability({
    taxableProfit,
    otherIncome,
    activePlans:  studentLoanPlans,
    poa1Paid,
    poa2Paid,
    sa303Elected,
    sa303Amount,
    config,
  })

  return {
    taxYear:      config.year,
    turnover,
    otherIncome,
    grossTurnover,
    incomeCount:  incomeRows.length,
    nonVehicleExpenses,
    totalNonVehicleExpenses,
    phoneClaim,
    vehicle,
    totalAllowableExpenses,
    netProfitPreAdjustments,
    overlapRelief,
    netProfitPostOverlap,
    lossesBroughtForward,
    taxableProfit,
    lossesRemainingAfterOffset,
    lossesCarriedForward,
    isLossYear,
    liability,
    approvedTransactionCount:   transactions.length,
    flaggedTransactionCount,
    outOfRangeTransactionCount,
  }
}

// ─── MTD quarterly (C-51 to C-54) ────────────────────────────────────────────

/**
 * Compute cumulative YTD figures from all quarters submitted so far.
 * Indicative profit is display-only — full annual calc runs at final declaration.
 */
export function calculateMtdYtd(quarters: MtdQuarterInput[]): MtdYtdResult[] {
  let cumulativeIncome   = 0
  let cumulativeExpenses = 0

  return quarters
    .slice()
    .sort((a, b) => a.quarter - b.quarter)
    .map((q) => {
      cumulativeIncome   += q.income
      cumulativeExpenses += q.expenses
      return {
        quarter:            q.quarter,
        cumulativeIncome,
        cumulativeExpenses,
        indicativeProfit:   cumulativeIncome - cumulativeExpenses,
      }
    })
}
