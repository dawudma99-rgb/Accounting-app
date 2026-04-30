import { DEFAULT_TAX_YEAR, getTaxYearConfig } from '@/config/taxYears'
import { supabaseServer } from '@/lib/supabase/server'
import { raiseSummaryFlags } from '@/services/flags'
import { calculateTaxSummary } from '@/services/tax/calculator'
import type { SavedTaxInputs } from '@/types/dashboard'
import type { TransactionCategory } from '@/types/transaction'
import type { StudentLoanPlan, TaxSummary, VehicleMethod } from '@/types/tax'

export async function getSavedTaxInputsForClient(
  clientId: string,
  taxYear: string,
): Promise<SavedTaxInputs | null> {
  const { data, error } = await supabaseServer
    .from('tax_years')
    .select('business_miles, other_income, tax_paid_at_source, student_loan_plan, declaration_confirmed, figures_saved_at')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    businessMiles:        data.business_miles        ?? null,
    otherIncome:          data.other_income          ?? null,
    taxPaidAtSource:      data.tax_paid_at_source    ?? 0,
    studentLoanPlan:      data.student_loan_plan     ?? null,
    declarationConfirmed: data.declaration_confirmed ?? false,
    figuresSavedAt:       data.figures_saved_at      ?? null,
  }
}

export async function saveTaxFiguresForClient(
  clientId: string,
  taxYear: string,
  inputs: {
    businessMiles?: number
    otherIncome?: number
    taxPaidAtSource: number
    studentLoanPlan?: string
    declarationConfirmed: boolean
  },
  figures: {
    turnover: number
    totalAllowableExpenses: number
    taxableProfit: number
    totalIncomeTax: number
    niClass2Annual: number
    totalNiClass4: number
    totalStudentLoan: number
    totalLiability: number
    requiresPaymentOnAccount: boolean
    poaPerPayment: number
    balancingPayment: number
    lossesCarriedForward: number
    januaryDate: string
    julyDate: string
  },
): Promise<void> {
  const { error } = await supabaseServer
    .from('tax_years')
    .upsert(
      {
        client_id:              clientId,
        tax_year:               taxYear,
        business_miles:         inputs.businessMiles       ?? null,
        other_income:           inputs.otherIncome         ?? null,
        tax_paid_at_source:     inputs.taxPaidAtSource,
        student_loan_plan:      inputs.studentLoanPlan     ?? null,
        declaration_confirmed:  inputs.declarationConfirmed,
        gross_income:           figures.turnover,
        total_expenses:         figures.totalAllowableExpenses,
        net_profit:             figures.taxableProfit,
        income_tax:             figures.totalIncomeTax,
        class2_nic:             figures.niClass2Annual,
        class4_nic:             figures.totalNiClass4,
        student_loan_repayment: figures.totalStudentLoan,
        total_liability:        figures.totalLiability,
        poa1_amount:            figures.requiresPaymentOnAccount ? figures.poaPerPayment : null,
        poa1_date:              figures.requiresPaymentOnAccount ? figures.januaryDate   : null,
        poa2_amount:            figures.requiresPaymentOnAccount ? figures.poaPerPayment : null,
        poa2_date:              figures.requiresPaymentOnAccount ? figures.julyDate      : null,
        balancing_payment:      figures.balancingPayment,
        losses_carried_forward: figures.lossesCarriedForward,
        figures_saved_at:       new Date().toISOString(),
      },
      { onConflict: 'client_id,tax_year' },
    )

  if (error) throw new Error(error.message)
}

export async function syncTaxSummaryFlags(
  clientId: string,
  taxYear: string,
  summary: TaxSummary,
): Promise<void> {
  await raiseSummaryFlags(clientId, taxYear, summary)
}

export async function buildTaxSummary(
  clientId: string,
  taxYear: string = DEFAULT_TAX_YEAR,
  businessMiles?: number,
  otherIncome?: number,
): Promise<TaxSummary> {
  const config    = getTaxYearConfig(taxYear)
  const priorYear = priorTaxYear(taxYear)

  const [txResult, vehicleResult, studentLoanResult, taxYearResult, priorYearResult] =
    await Promise.all([
      supabaseServer
        .from('transactions')
        .select('date, amount, category, status')
        .eq('client_id', clientId),

      supabaseServer
        .from('vehicles')
        .select('id, expense_method, business_use_percent, co2_gkm, purchase_price, purchase_date, expense_method_locked, disposal_date, disposal_proceeds')
        .eq('client_id', clientId)
        .is('disposal_date', null)
        .order('purchase_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabaseServer
        .from('student_loans')
        .select('plan_type')
        .eq('client_id', clientId)
        .eq('active', true),

      supabaseServer
        .from('tax_years')
        .select('losses_brought_forward, overlap_relief_claimed, sa303_elected, sa303_reduced_amount')
        .eq('client_id', clientId)
        .eq('tax_year', taxYear)
        .maybeSingle(),

      supabaseServer
        .from('tax_years')
        .select('poa1_amount, poa1_paid, poa2_amount, poa2_paid')
        .eq('client_id', clientId)
        .eq('tax_year', priorYear)
        .maybeSingle(),
    ])

  if (txResult.error) throw new Error(txResult.error.message)

  const vehicle = vehicleResult.data
  const tyRow   = taxYearResult.data
  const priorTY = priorYearResult.data
  const all     = txResult.data ?? []

  const inYear     = all.filter((t) => t.date >= config.startDate && t.date <= config.endDate)
  const outOfRange = all.filter((t) => t.date < config.startDate || t.date > config.endDate)
  const approved   = inYear.filter((t) => t.status === 'auto_approved' || t.status === 'reviewed')
  const flagged    = inYear.filter((t) => t.status === 'flagged')

  const vehicleMethod: VehicleMethod = (vehicle?.expense_method as VehicleMethod | null) ?? 'mileage'
  const businessUsePct = vehicle?.business_use_percent ?? 100

  const isYearOne = !!(
    vehicle &&
    !vehicle.expense_method_locked &&
    vehicle.purchase_date >= config.startDate &&
    vehicle.purchase_date <= config.endDate
  )

  const isDisposalYear = !!(
    vehicle?.disposal_date &&
    vehicle.disposal_date >= config.startDate &&
    vehicle.disposal_date <= config.endDate
  )

  const fuelTotal = approved
    .filter((t) => t.category === 'fuel' && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  let openingPoolValue = 0
  let vehicleAdditions = 0

  if (vehicle && vehicleMethod === 'actual') {
    vehicleAdditions = isYearOne && vehicle.purchase_price ? Number(vehicle.purchase_price) : 0

    if (!isYearOne) {
      const { data: poolYear } = await supabaseServer
        .from('vehicle_pool_years')
        .select('opening_pool')
        .eq('vehicle_id', vehicle.id)
        .eq('tax_year', taxYear)
        .maybeSingle()
      openingPoolValue = poolYear?.opening_pool ? Number(poolYear.opening_pool) : 0
    }
  }

  const poa1Paid = (priorTY?.poa1_paid && priorTY?.poa1_amount) ? Number(priorTY.poa1_amount) : 0
  const poa2Paid = (priorTY?.poa2_paid && priorTY?.poa2_amount) ? Number(priorTY.poa2_amount) : 0

  const studentLoanPlans = (studentLoanResult.data ?? []).map((r) => r.plan_type as StudentLoanPlan)

  return calculateTaxSummary(
    approved.map((t) => ({
      amount:   Number(t.amount),
      category: t.category as TransactionCategory,
      date:     t.date,
    })),
    config,
    {
      vehicleMethod,
      businessMiles,
      actualCostsGross:     vehicleMethod === 'actual' ? fuelTotal : undefined,
      rentalCosts:          vehicleMethod === 'rental' ? fuelTotal : undefined,
      businessUsePct,
      openingPoolValue,
      vehicleAdditions,
      co2Gkm:               vehicle?.co2_gkm ?? undefined,
      isYearOne,
      isDisposalYear,
      disposalProceeds:     isDisposalYear && vehicle?.disposal_proceeds
                              ? Number(vehicle.disposal_proceeds) : undefined,
      otherIncome,
      overlapRelief:        tyRow?.overlap_relief_claimed ? Number(tyRow.overlap_relief_claimed) : 0,
      lossesBroughtForward: tyRow?.losses_brought_forward ? Number(tyRow.losses_brought_forward) : 0,
      poa1Paid,
      poa2Paid,
      sa303Elected:         tyRow?.sa303_elected ?? false,
      sa303Amount:          tyRow?.sa303_reduced_amount ? Number(tyRow.sa303_reduced_amount) : undefined,
      studentLoanPlans,
      flaggedTransactionCount:    flagged.length,
      outOfRangeTransactionCount: outOfRange.length,
    },
  )
}

function priorTaxYear(year: string): string {
  const [startStr, endStr] = year.split('/')
  return `${Number(startStr) - 1}/${String(Number(endStr) - 1).padStart(2, '0')}`
}
