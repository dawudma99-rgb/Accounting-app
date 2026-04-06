import type { TaxBandResult } from './tax'

// ─── Student Loan ─────────────────────────────────────────────────────────────

export type StudentLoanPlan =
  | 'none'
  | 'plan1'
  | 'plan2'
  | 'plan4'
  | 'postgraduate'

export const STUDENT_LOAN_PLAN_LABELS: Record<StudentLoanPlan, string> = {
  none:         'No student loan',
  plan1:        'Plan 1',
  plan2:        'Plan 2',
  plan4:        'Plan 4 (Scotland)',
  postgraduate: 'Postgraduate loan',
}

// ─── Filing Blockers ──────────────────────────────────────────────────────────

export interface SA100Blocker {
  /** blocking = prevents ready state · warning = should review but not blocking */
  severity: 'blocking' | 'warning'
  label: string
  message: string
}

// ─── SA100 Preview ────────────────────────────────────────────────────────────

/**
 * Represents the full self assessment outcome after the SA103 business profit
 * is brought in. Built from the already-computed TaxSummary + optional inputs.
 */
export interface SA100Preview {
  taxYear: string

  // ── Income ───────────────────────────────────────────────────────────────
  selfEmploymentProfit: number
  otherIncome: number
  totalIncome: number
  personalAllowance: number
  /** After personal allowance taper for high earners */
  effectivePersonalAllowance: number
  taxableIncome: number

  // ── Income tax ────────────────────────────────────────────────────────────
  incomeTaxBands: TaxBandResult[]
  totalIncomeTax: number

  // ── National Insurance ─────────────────────────────────────────────────────
  niClass4Lower: number
  niClass4Upper: number
  totalNiClass4: number
  niClass2Secured: boolean
  niClass2Annual: number

  // ── Liability ─────────────────────────────────────────────────────────────
  grossTaxLiability: number
  /** Tax already collected via PAYE on employment or other income */
  taxPaidAtSource: number
  /** grossTaxLiability − taxPaidAtSource — the actual amount due via Self Assessment */
  netTaxLiability: number

  // ── Payment schedule ──────────────────────────────────────────────────────
  requiresPaymentOnAccount: boolean
  januaryPayment: number
  julyPayment: number
  januaryDate: string
  julyDate: string

  // ── Take-home ─────────────────────────────────────────────────────────────
  /** Self-employment profit minus net tax liability */
  afterTaxProfit: number
  /** netTaxLiability ÷ selfEmploymentProfit × 100 */
  effectiveTaxRate: number

  // ── Filing status ─────────────────────────────────────────────────────────
  studentLoanPlan: StudentLoanPlan | undefined
  declarationConfirmed: boolean
  blockers: SA100Blocker[]
  isReadyForSubmission: boolean
}
