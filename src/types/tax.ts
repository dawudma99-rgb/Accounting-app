import type { TransactionCategory } from './transaction'

// ─── Tax Year Config ──────────────────────────────────────────────────────────

export interface MileageBand {
  bandSizeMiles: number | null
  ratePerMile: number
}

export interface IncomeTaxBand {
  label: string
  from: number
  to: number | null
  rate: number
}

export interface IncomeTaxConfig {
  personalAllowance: number
  taperThreshold: number
  bands: IncomeTaxBand[]
}

export interface NiClass2Config {
  smallProfitsThreshold: number
  weeklyRate: number
  weeksInYear: number
}

export interface NiClass4Config {
  lowerProfitsLimit: number
  upperProfitsLimit: number
  lowerRate: number
  upperRate: number
}

export interface NiConfig {
  class2: NiClass2Config
  class4: NiClass4Config
}

export interface StudentLoanPlanConfig {
  threshold: number
  rate: number
}

export interface StudentLoansConfig {
  plan1: StudentLoanPlanConfig
  plan2: StudentLoanPlanConfig
  plan4: StudentLoanPlanConfig
  pgl:   StudentLoanPlanConfig
}

export interface PaymentConfig {
  januaryDate: string
  julyDate: string
  onAccountThreshold: number
}

export interface TaxYearConfig {
  year: string
  startDate: string
  endDate: string
  mileageRates: MileageBand[]
  incomeTax: IncomeTaxConfig
  nationalInsurance: NiConfig
  studentLoans: StudentLoansConfig
  payments: PaymentConfig
  sa103sThreshold: number
}

// ─── Calculator Inputs ────────────────────────────────────────────────────────

export interface ApprovedTransaction {
  amount: number
  category: TransactionCategory
  date: string
}

// ─── Vehicle ──────────────────────────────────────────────────────────────────

export type VehicleMethod = 'actual' | 'mileage' | 'rental'

export interface MileageBandUsage {
  miles: number
  ratePerMile: number
  amount: number
}

export interface CapitalAllowanceResult {
  openingPool:           number
  additions:             number
  wdaRate:               number
  wdaGross:              number
  privateUseRestriction: number
  allowableWDA:          number
  closingPool:           number
  balancingAllowance:    number
  balancingCharge:       number
  isEV:                  boolean
}

export interface VehicleDeduction {
  method: VehicleMethod

  // Mileage method (C-06 to C-09)
  businessMiles:        number | null
  mileageBandBreakdown: MileageBandUsage[] | null
  mileageAllowance:     number | null

  // Actual costs method (C-10 to C-17)
  actualCostsGross:     number | null
  businessUsePercent:   number | null
  allowableActualCosts: number | null
  capitalAllowance:     CapitalAllowanceResult | null

  // Rental method (C-19 to C-20)
  rentalCosts:         number | null
  rentalFuel:          number | null
  allowableRentalClaim: number | null
  allowableFuelClaim:  number | null

  // Final chosen amount for expenses
  chosenAmount: number

  // Year one comparison (C-18)
  yearOneComparison: {
    mileageClaim:      number
    actualPlusWDA:     number
    recommendedMethod: VehicleMethod
    saving:            number
  } | null
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  category: TransactionCategory
  label: string
  amount: number
  count: number
}

// ─── Income tax ───────────────────────────────────────────────────────────────

export interface TaxBandResult {
  label: string
  rate: number
  taxableAmount: number
  taxDue: number
}

// ─── Student loan ─────────────────────────────────────────────────────────────

export type StudentLoanPlan = 'plan1' | 'plan2' | 'plan4' | 'pgl'

export interface StudentLoanRepayment {
  plan:       StudentLoanPlan
  threshold:  number
  rate:       number
  repayment:  number
}

// ─── Tax Liability ────────────────────────────────────────────────────────────

export interface TaxLiability {
  // ── Income basis ──────────────────────────────────────────────────────────
  taxableProfit:              number
  otherIncome:                number
  adjustedNetIncome:          number
  personalAllowance:          number
  effectivePersonalAllowance: number
  taxableIncome:              number

  // ── Income tax (C-32 to C-35) ─────────────────────────────────────────────
  incomeTaxBands:  TaxBandResult[]
  totalIncomeTax:  number

  // ── National Insurance (C-36 to C-39) ────────────────────────────────────
  niClass2Secured: boolean
  niClass2Annual:  number
  niClass4Lower:   number
  niClass4Upper:   number
  totalNiClass4:   number

  // ── Student loan (C-40 to C-44) ──────────────────────────────────────────
  studentLoanBreakdown: StudentLoanRepayment[]
  totalStudentLoan:     number

  // ── Total liability (C-45) ───────────────────────────────────────────────
  totalLiability: number

  // ── Payments on account (C-46 to C-49) ───────────────────────────────────
  requiresPaymentOnAccount: boolean
  poaPerPayment:            number
  balancingPayment:         number
  januaryTotal:             number
  julyTotal:                number
  januaryDate:              string
  julyDate:                 string

  // ── SA303 POA reduction (C-50) ────────────────────────────────────────────
  sa303Elected:      boolean
  sa303ReducedAmount: number | null
  effectivePoaAmount: number

  // ── Take-home ─────────────────────────────────────────────────────────────
  afterTaxProfit:  number
  effectiveTaxRate: number
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────

export interface TaxSummary {
  taxYear: string

  // ── Income (C-01 to C-04) ────────────────────────────────────────────────
  turnover:     number
  otherIncome:  number
  grossTurnover: number
  incomeCount:  number

  // ── Expenses ──────────────────────────────────────────────────────────────
  nonVehicleExpenses:      ExpenseLineItem[]
  totalNonVehicleExpenses: number
  phoneClaim:              number
  vehicle:                 VehicleDeduction
  totalAllowableExpenses:  number

  // ── Profit adjustments (C-24 to C-28) ───────────────────────────────────
  netProfitPreAdjustments: number
  overlapRelief:           number
  netProfitPostOverlap:    number
  lossesBroughtForward:    number
  taxableProfit:           number
  lossesRemainingAfterOffset: number
  lossesCarriedForward:    number
  isLossYear:              boolean

  // ── Liability ─────────────────────────────────────────────────────────────
  liability: TaxLiability

  // ── Metadata ──────────────────────────────────────────────────────────────
  approvedTransactionCount:   number
  flaggedTransactionCount:    number
  outOfRangeTransactionCount: number
}

// ─── MTD Quarterly ───────────────────────────────────────────────────────────

export interface MtdQuarterInput {
  quarter:  1 | 2 | 3 | 4
  income:   number
  expenses: number
}

export interface MtdYtdResult {
  quarter:             1 | 2 | 3 | 4
  cumulativeIncome:    number
  cumulativeExpenses:  number
  indicativeProfit:    number
}
