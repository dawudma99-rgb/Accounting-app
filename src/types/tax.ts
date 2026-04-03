import type { TransactionCategory } from './transaction'

// ─── Tax Year Config ──────────────────────────────────────────────────────────
//
// All year-specific constants live here.
// To add a new tax year: add one entry to src/config/taxYears.ts.
// Nothing in the calculator or UI needs to change.

/**
 * A single HMRC mileage rate band.
 * bandSizeMiles is the WIDTH of the band, not a cumulative ceiling.
 * null = unlimited — used for the final band only.
 */
export interface MileageBand {
  bandSizeMiles: number | null
  ratePerMile: number
}

/** A single income tax band. from/to are amounts of TAXABLE INCOME (above personal allowance). */
export interface IncomeTaxBand {
  label: string
  from: number
  /** null = no upper limit */
  to: number | null
  rate: number
}

export interface IncomeTaxConfig {
  personalAllowance: number
  /**
   * Income above this threshold causes the personal allowance to taper:
   * £1 reduction for every £2 of income above this figure.
   * The allowance is fully withdrawn at taperThreshold + (2 × personalAllowance).
   */
  taperThreshold: number
  bands: IncomeTaxBand[]
}

export interface NiClass2Config {
  /** Profits must exceed this for the state pension credit to be secured */
  smallProfitsThreshold: number
  /** Weekly voluntary rate — informational only since April 2024 */
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

export interface PaymentConfig {
  /**
   * 31 January following the tax year end.
   * Sole traders file their return and pay any balancing amount here.
   */
  januaryDate: string
  /**
   * 31 July following the filing deadline.
   * Second payment on account for the following year.
   */
  julyDate: string
  /**
   * Payments on account are only required if the SA liability exceeds this
   * threshold. Below it, the full amount is due in January only.
   */
  onAccountThreshold: number
}

/** All year-specific tax constants. Add a new entry per tax year — nothing else changes. */
export interface TaxYearConfig {
  year: string
  /** ISO date string — inclusive start of the tax year */
  startDate: string
  /** ISO date string — inclusive end of the tax year */
  endDate: string
  mileageRates: MileageBand[]
  incomeTax: IncomeTaxConfig
  nationalInsurance: NiConfig
  payments: PaymentConfig
}

// ─── Calculator Inputs ────────────────────────────────────────────────────────

export interface ApprovedTransaction {
  amount: number
  category: TransactionCategory
  date: string
}

// ─── Vehicle Deduction ────────────────────────────────────────────────────────

export type VehicleMethod = 'actual' | 'mileage'

export interface MileageBandUsage {
  miles: number
  ratePerMile: number
  amount: number
}

export interface VehicleDeduction {
  actualCosts: number
  mileageAllowance: number | null
  mileageBandBreakdown: MileageBandUsage[] | null
  businessMiles: number | null
  chosenMethod: VehicleMethod
  chosenAmount: number
  saving: number | null
}

// ─── Expense Line Item ────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  category: TransactionCategory
  label: string
  amount: number
  count: number
}

// ─── Tax Liability ────────────────────────────────────────────────────────────

/** One income tax band's contribution to the total bill */
export interface TaxBandResult {
  label: string
  rate: number
  taxableAmount: number
  taxDue: number
}

export interface TaxLiability {
  // ── Inputs ────────────────────────────────────────────────────────────────
  netProfit: number
  otherIncome: number

  // ── Income basis ──────────────────────────────────────────────────────────
  totalIncome: number
  /** Standard personal allowance for the tax year */
  personalAllowance: number
  /** After taper — may be less than personalAllowance for high earners */
  effectivePersonalAllowance: number
  taxableIncome: number

  // ── Income tax ────────────────────────────────────────────────────────────
  incomeTaxBands: TaxBandResult[]
  totalIncomeTax: number

  // ── National Insurance ─────────────────────────────────────────────────────
  niClass4Lower: number
  niClass4Upper: number
  totalNiClass4: number
  /** True when profits ≥ small profits threshold — state pension credit secured */
  niClass2Secured: boolean
  /** Voluntary Class 2 annual amount — informational only, not in the total */
  niClass2Annual: number

  // ── Total & payments ──────────────────────────────────────────────────────
  /** Income tax + Class 4 NI. Class 2 excluded — not a mandatory payment since April 2024. */
  totalLiability: number
  requiresPaymentOnAccount: boolean
  /** 50% of liability, due 31 January. Full liability if below POA threshold. */
  januaryPayment: number
  /** 50% of liability, due 31 July. Zero if below POA threshold. */
  julyPayment: number
  januaryDate: string
  julyDate: string

  // ── Take-home ─────────────────────────────────────────────────────────────
  /** netProfit − totalLiability */
  afterTaxProfit: number
  /** totalLiability ÷ netProfit × 100 */
  effectiveTaxRate: number
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────

export interface TaxSummary {
  taxYear: string

  turnover: number
  incomeCount: number

  nonVehicleExpenses: ExpenseLineItem[]
  totalNonVehicleExpenses: number

  vehicle: VehicleDeduction

  totalAllowableExpenses: number
  netProfit: number

  /** Full income tax and NI liability based on this year's net profit */
  liability: TaxLiability

  approvedTransactionCount: number
  flaggedTransactionCount: number
  outOfRangeTransactionCount: number
}
