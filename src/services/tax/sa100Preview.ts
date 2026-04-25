import type { SA100Blocker, SA100Preview, StudentLoanPlan } from '@/types/sa100'
import type { TaxSummary, TaxYearConfig } from '@/types/tax'

function fmt(n: number): string {
  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildSA100Preview(
  summary: TaxSummary,
  utr: string | null,
  options: {
    taxPaidAtSource?:      number
    studentLoanPlan?:      StudentLoanPlan
    declarationConfirmed?: boolean
    sa103HasBlockingFlags?: boolean
  },
  config: TaxYearConfig,
): SA100Preview {
  const {
    taxPaidAtSource      = 0,
    studentLoanPlan,
    declarationConfirmed  = false,
    sa103HasBlockingFlags = false,
  } = options

  const liability = summary.liability

  // Liability after PAYE
  const grossTaxLiability = liability.totalLiability
  const netTaxLiability   = Math.max(0, grossTaxLiability - taxPaidAtSource)

  // Payment schedule on net liability
  const requiresPaymentOnAccount = netTaxLiability > config.payments.onAccountThreshold
  const januaryPayment = requiresPaymentOnAccount ? netTaxLiability / 2 : netTaxLiability
  const julyPayment    = requiresPaymentOnAccount ? netTaxLiability / 2 : 0

  const afterTaxProfit   = summary.taxableProfit - netTaxLiability
  const effectiveTaxRate = summary.taxableProfit > 0
    ? (netTaxLiability / summary.taxableProfit) * 100
    : 0

  // Filing blockers
  const blockers: SA100Blocker[] = []

  if (!utr) {
    blockers.push({
      severity: 'blocking',
      label:    'UTR missing',
      message:  'Unique Taxpayer Reference is required before filing.',
    })
  }

  if (sa103HasBlockingFlags) {
    blockers.push({
      severity: 'blocking',
      label:    'SA103 has unresolved items',
      message:  'Resolve outstanding action items in the Dashboard before treating this return as ready.',
    })
  }

  if (!declarationConfirmed) {
    blockers.push({
      severity: 'blocking',
      label:    'Declaration not confirmed',
      message:  'Client must confirm the declaration before the return can be filed.',
    })
  }

  if (liability.otherIncome > 0 && taxPaidAtSource === 0) {
    blockers.push({
      severity: 'warning',
      label:    'Tax paid at source not entered',
      message:  `Other income of ${fmt(liability.otherIncome)} included. If tax was deducted at source, enter it to calculate the correct net liability.`,
    })
  }

  if (studentLoanPlan === undefined) {
    blockers.push({
      severity: 'warning',
      label:    'Student loan plan not selected',
      message:  'Select the client\'s student loan plan, or "No student loan" if not applicable.',
    })
  }

  const isReadyForSubmission = !blockers.some((b) => b.severity === 'blocking')

  return {
    taxYear: summary.taxYear,

    selfEmploymentProfit:       summary.taxableProfit,
    otherIncome:                liability.otherIncome,
    totalIncome:                liability.adjustedNetIncome,
    personalAllowance:          liability.personalAllowance,
    effectivePersonalAllowance: liability.effectivePersonalAllowance,
    taxableIncome:              liability.taxableIncome,

    incomeTaxBands:  liability.incomeTaxBands,
    totalIncomeTax:  liability.totalIncomeTax,

    niClass4Lower:   liability.niClass4Lower,
    niClass4Upper:   liability.niClass4Upper,
    totalNiClass4:   liability.totalNiClass4,
    niClass2Secured: liability.niClass2Secured,
    niClass2Annual:  liability.niClass2Annual,

    grossTaxLiability,
    taxPaidAtSource,
    netTaxLiability,

    requiresPaymentOnAccount,
    januaryPayment,
    julyPayment,
    januaryDate: config.payments.januaryDate,
    julyDate:    config.payments.julyDate,

    afterTaxProfit,
    effectiveTaxRate,

    studentLoanPlan,
    declarationConfirmed,
    blockers,
    isReadyForSubmission,
  }
}
