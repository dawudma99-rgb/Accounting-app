'use server'

import { confirmRule } from '@/services/categorisation/engine'
import { checkClientCompleteness, raiseSummaryFlags, syncTransactionFlags } from '@/services/flags'
import { getClientSummary } from '@/lib/client'
import { extractReceiptsFromImages } from '@/services/ocr/receipt'
import type { OcrParseResult } from '@/services/ocr/receipt'
import { supabaseServer } from '@/lib/supabase/server'
import type {
  BusinessType,
  TransactionCategory,
} from '@/types/transaction'
import { calculateTaxSummary } from '@/services/tax/calculator'
import { getTaxYearConfig, DEFAULT_TAX_YEAR } from '@/config/taxYears'
import type { TaxSummary, VehicleMethod, StudentLoanPlan } from '@/types/tax'
import {
  evaluateReturn,
  advanceReturnStatus,
} from '@/services/returns/evaluate'
import type { ReturnEvaluation, ReturnStatus } from '@/services/returns/evaluate'

// ─── Client types ─────────────────────────────────────────────────────────────

export interface ClientRecord {
  id: string
  name: string
  business_type: BusinessType
  utr: string | null
  created_at: string
}

export interface TransactionToSave {
  id: string
  date: string
  amount: number
  merchant: string | null
  description: string
  category: TransactionCategory
  confidence: number
  reasoning: string
  source: 'ai' | 'rules' | 'hardcoded' | 'memory'
  matchSource: 'receipt' | 'receipt-uncertain' | 'platform' | 'unmatched'
  matchedPattern?: string | null
  reviewReason?: string | null
}

export interface SavedTransaction {
  id: string
  date: string
  amount: number
  merchant: string | null
  description: string | null
  category: string
  confidence_score: number
  status: string
  reasoning: string | null
  source: string | null
  match_source: string | null
  matched_pattern: string | null
  review_reason: string | null
  created_at: string
}

export interface SavedTaxYearSummary {
  id: string
  tax_year: string
  gross_income: number | null
  total_expenses: number | null
  net_profit: number | null
  total_liability: number | null
  return_status: ReturnStatus
  figures_saved_at: string | null
}

// ─── Process a batch of transactions ─────────────────────────────────────────

export interface ProcessedRow {
  description: string
  merchant?: string
  amount: number
  date: string
  category: TransactionCategory
  confidence: number
  source: 'rules' | 'ai'
  reasoning: string
  matchedPattern?: string
}


/**
 * Persist a user-confirmed merchant categorisation at 99% confidence.
 * Called when the user clicks "Approve & remember" in the dashboard.
 */
export async function confirmTransaction(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  await confirmRule(pattern, businessType, category)
}

/**
 * Run Claude Vision OCR on a batch of receipt images.
 * Called from the dashboard after the user uploads receipt files.
 *
 * Files are passed as base64 strings since File objects cannot be serialised
 * through server actions directly.
 */
export async function ocrReceipts(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  return extractReceiptsFromImages(files)
}

/**
 * Save multiple rules to the rulebook in a single Supabase upsert.
 * Called by the bulk approve bar when the accountant approves a filtered set.
 */
export async function bulkConfirmTransactions(
  rules: Array<{ pattern: string; category: TransactionCategory }>,
  businessType: BusinessType,
): Promise<void> {
  if (rules.length === 0) return

  const { error } = await supabaseServer
    .from('category_rules')
    .upsert(
      rules.map((r) => ({
        pattern:       r.pattern,
        business_type: businessType,
        category:      r.category,
        confidence:    99,
      })),
      { onConflict: 'pattern,business_type' },
    )

  if (error) throw new Error(error.message)
}

// ─── Client CRUD ──────────────────────────────────────────────────────────────

/**
 * Fetch all clients ordered by creation date descending.
 */
export async function getClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabaseServer
    .from('clients')
    .select('id, name, business_type, utr, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientRecord[]
}

/**
 * Create a new client and return the inserted row.
 */
export async function createClient(input: {
  name: string
  businessType: BusinessType
  utr?: string | null
}): Promise<ClientRecord> {
  const { data, error } = await supabaseServer
    .from('clients')
    .insert({
      name:          input.name,
      business_type: input.businessType,
      utr:           input.utr ?? null,
    })
    .select('id, name, business_type, utr, created_at')
    .single()

  if (error) throw new Error(error.message)

  // Trigger P-01–P-08 profile checks on the newly created client
  try {
    const client = await getClientSummary(data.id)
    await checkClientCompleteness(client, DEFAULT_TAX_YEAR)
  } catch (flagErr) {
    console.warn('[flags] Profile check failed after createClient:', (flagErr as Error).message)
  }

  return data as ClientRecord
}

/**
 * Bulk-insert categorised transactions from a run under a given client.
 * Each row maps to the transactions table schema.
 */
export async function saveRunTransactions(
  clientId: string,
  transactions: TransactionToSave[],
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  if (transactions.length === 0) return

  const { error } = await supabaseServer
    .from('transactions')
    .insert(
      transactions.map((t) => ({
        id:               t.id,
        client_id:        clientId,
        date:             t.date,
        amount:           t.amount,
        merchant:         t.merchant,
        description:      t.description,
        category:         t.category,
        confidence_score: t.confidence,
        status:           t.confidence >= 80 ? 'auto_approved' : 'flagged',
        reasoning:        t.reasoning,
        source:           t.source,
        match_source:     t.matchSource,
        matched_pattern:  t.matchedPattern ?? null,
        review_reason:    t.reviewReason ?? null,
      })),
    )

  if (error) throw new Error(error.message)

  // Count flagged transactions in this tax year and sync the DB flag
  const tyConfig = getTaxYearConfig(taxYear)
  const { count } = await supabaseServer
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'flagged')
    .gte('date', tyConfig.startDate)
    .lte('date', tyConfig.endDate)

  await syncTransactionFlags(clientId, taxYear, count ?? 0).catch(console.warn)
}

/**
 * Mark one saved transaction as manually reviewed after accountant approval.
 * This makes the database match the dashboard state used for tax summaries.
 */
export async function markTransactionReviewed(
  transactionId: string,
  category: TransactionCategory,
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  const { error } = await supabaseServer
    .from('transactions')
    .update({
      category,
      status:        'reviewed',
      review_reason: null,
    })
    .eq('id', transactionId)

  if (error) throw new Error(error.message)

  if (clientId) {
    const tyConfig = getTaxYearConfig(taxYear)
    const { count } = await supabaseServer
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'flagged')
      .gte('date', tyConfig.startDate)
      .lte('date', tyConfig.endDate)
    await syncTransactionFlags(clientId, taxYear, count ?? 0).catch(console.warn)
  }
}

/**
 * Mark a set of saved transactions as reviewed after bulk approval.
 */
export async function bulkMarkTransactionsReviewed(
  transactionIds: string[],
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  if (transactionIds.length === 0) return

  const { error } = await supabaseServer
    .from('transactions')
    .update({
      status:        'reviewed',
      review_reason: null,
    })
    .in('id', transactionIds)

  if (error) throw new Error(error.message)

  if (clientId) {
    const tyConfig = getTaxYearConfig(taxYear)
    const { count } = await supabaseServer
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'flagged')
      .gte('date', tyConfig.startDate)
      .lte('date', tyConfig.endDate)
    await syncTransactionFlags(clientId, taxYear, count ?? 0).catch(console.warn)
  }
}

/**
 * Fetch saved transactions for a client, optionally scoped to a date range.
 */
export async function getClientTransactions(
  clientId:  string,
  startDate?: string,
  endDate?:   string,
): Promise<SavedTransaction[]> {
  let query = supabaseServer
    .from('transactions')
    .select('id, date, amount, merchant, description, category, confidence_score, status, reasoning, source, match_source, matched_pattern, review_reason, created_at')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (startDate) query = query.gte('date', startDate)
  if (endDate)   query = query.lte('date', endDate)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as SavedTransaction[]
}

/**
 * Fetch saved tax-year summaries for the client detail view.
 * This reads persisted figures from tax_years instead of recomputing from transactions.
 */
export async function getClientTaxYears(clientId: string): Promise<SavedTaxYearSummary[]> {
  const { data, error } = await supabaseServer
    .from('tax_years')
    .select('id, tax_year, gross_income, total_expenses, net_profit, total_liability, return_status, figures_saved_at')
    .eq('client_id', clientId)
    .order('tax_year', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as SavedTaxYearSummary[]
}

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * Load all user-confirmed rules (confidence >= 99) for a given business type.
 * Called on dashboard mount to restore merchant memory across page refreshes.
 */
export async function loadConfirmedRules(
  businessType: BusinessType,
): Promise<Array<{ pattern: string; category: TransactionCategory }>> {
  const { data, error } = await supabaseServer
    .from('category_rules')
    .select('pattern, category')
    .eq('business_type', businessType)
    .gte('confidence', 99)

  if (error) {
    console.warn('[loadConfirmedRules] Supabase lookup failed:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    pattern:  r.pattern,
    category: r.category as TransactionCategory,
  }))
}

// ─── Flags ────────────────────────────────────────────────────────────────────

export interface ClientFlag {
  id:              string
  client_id:       string
  tax_year:        string | null
  flag_type:       string
  description:     string
  status:          string
  raised_at:       string
  resolved_at:     string | null
  override_reason: string | null
}

/**
 * Run the P-01 to P-33 completeness check for a client and persist any new flags.
 * Safe to call repeatedly — will not duplicate open flags.
 */
export async function runFlagCheck(clientId: string, taxYear: string): Promise<void> {
  const summary = await getClientSummary(clientId)
  await checkClientCompleteness(summary, taxYear)
}

/**
 * Fetch all open flags for a client, newest first.
 */
export async function getClientFlags(clientId: string): Promise<ClientFlag[]> {
  const { data, error } = await supabaseServer
    .from('flags')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('raised_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientFlag[]
}

/**
 * Resolve or override a flag. Optionally record the accountant's reason.
 */
export async function resolveFlag(
  flagId: string,
  status: 'resolved' | 'overridden',
  overrideReason?: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from('flags')
    .update({
      status,
      resolved_at:     new Date().toISOString(),
      override_reason: overrideReason ?? null,
    })
    .eq('id', flagId)

  if (error) throw new Error(error.message)
}

/**
 * Fetch open flag counts per client for the clients list view.
 */
export async function getClientFlagCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabaseServer
    .from('flags')
    .select('client_id')
    .eq('status', 'open')

  if (error) return {}

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.client_id] = (acc[row.client_id] ?? 0) + 1
    return acc
  }, {})
}

// ─── Tax figures persistence ──────────────────────────────────────────────────

export interface SavedTaxInputs {
  businessMiles:        number | null
  otherIncome:          number | null
  taxPaidAtSource:      number
  studentLoanPlan:      string | null
  declarationConfirmed: boolean
  figuresSavedAt:       string | null
}

/**
 * Fetch the previously saved calculator inputs for a client/year.
 * Returns null if no tax_years row exists yet.
 */
export async function getSavedTaxInputs(
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

/**
 * Persist the accountant's entered inputs and the resulting calculated figures
 * to the tax_years row. Creates the row if it doesn't exist yet.
 * Sets figures_saved_at, which is required before the return can advance.
 */
export async function saveTaxFigures(
  clientId: string,
  taxYear: string,
  inputs: {
    businessMiles?:       number
    otherIncome?:         number
    taxPaidAtSource:      number
    studentLoanPlan?:     string
    declarationConfirmed: boolean
  },
  figures: {
    turnover:                 number
    totalAllowableExpenses:   number
    taxableProfit:            number
    totalIncomeTax:           number
    niClass2Annual:           number
    totalNiClass4:            number
    totalStudentLoan:         number
    totalLiability:           number
    requiresPaymentOnAccount: boolean
    poaPerPayment:            number
    balancingPayment:         number
    lossesCarriedForward:     number
    januaryDate:              string
    julyDate:                 string
  },
): Promise<void> {
  const { error } = await supabaseServer
    .from('tax_years')
    .upsert(
      {
        client_id:            clientId,
        tax_year:             taxYear,
        // Inputs
        business_miles:       inputs.businessMiles       ?? null,
        other_income:         inputs.otherIncome         ?? null,
        tax_paid_at_source:   inputs.taxPaidAtSource,
        student_loan_plan:    inputs.studentLoanPlan     ?? null,
        declaration_confirmed: inputs.declarationConfirmed,
        // Calculated figures
        gross_income:         figures.turnover,
        total_expenses:       figures.totalAllowableExpenses,
        net_profit:           figures.taxableProfit,
        income_tax:           figures.totalIncomeTax,
        class2_nic:           figures.niClass2Annual,
        class4_nic:           figures.totalNiClass4,
        student_loan_repayment: figures.totalStudentLoan,
        total_liability:      figures.totalLiability,
        poa1_amount:          figures.requiresPaymentOnAccount ? figures.poaPerPayment : null,
        poa1_date:            figures.requiresPaymentOnAccount ? figures.januaryDate   : null,
        poa2_amount:          figures.requiresPaymentOnAccount ? figures.poaPerPayment : null,
        poa2_date:            figures.requiresPaymentOnAccount ? figures.julyDate      : null,
        balancing_payment:    figures.balancingPayment,
        losses_carried_forward: figures.lossesCarriedForward,
        figures_saved_at:     new Date().toISOString(),
      },
      { onConflict: 'client_id,tax_year' },
    )

  if (error) throw new Error(error.message)
}

/**
 * Sync summary-derived flags (unresolved transactions, other expenses, trading
 * loss) to the DB. Called from TaxView after saving figures so evaluateReturn
 * has full visibility into SA103-level conditions.
 */
export async function syncSummaryFlags(
  clientId: string,
  taxYear: string,
  summary: TaxSummary,
): Promise<void> {
  await raiseSummaryFlags(clientId, taxYear, summary)
}

// ─── Return status & enforcement ─────────────────────────────────────────────

/**
 * Evaluate the current return state for a client/year.
 * Returns blockers, warnings, current status, and the next valid status.
 * Safe to call at any time — read-only.
 */
export async function getReturnEvaluation(
  clientId: string,
  taxYear: string,
): Promise<ReturnEvaluation> {
  return evaluateReturn(clientId, taxYear)
}

/**
 * Advance the return to the next status in the state machine.
 * Throws if any blockers are present.
 */
export async function advanceReturn(
  clientId: string,
  taxYear: string,
  to: ReturnStatus,
): Promise<ReturnEvaluation> {
  return advanceReturnStatus(clientId, taxYear, to)
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────

function priorTaxYear(year: string): string {
  const [startStr, endStr] = year.split('/')
  return `${Number(startStr) - 1}/${String(Number(endStr) - 1).padStart(2, '0')}`
}

/**
 * Fetch all data required for the tax calculation, derive all calculator inputs
 * from the DB, and return a fully computed TaxSummary.
 *
 * businessMiles and otherIncome are UI-entered overrides (also persisted to
 * tax_years via saveTaxFigures). All other inputs are pulled from the DB.
 */
export async function getTaxSummary(
  clientId: string,
  taxYear:       string = DEFAULT_TAX_YEAR,
  businessMiles?: number,
  otherIncome?:   number,
): Promise<TaxSummary> {
  const config    = getTaxYearConfig(taxYear)
  const priorYear = priorTaxYear(taxYear)

  // ── Fetch everything in parallel ────────────────────────────────────────────
  const [txResult, vehicleResult, studentLoanResult, taxYearResult, priorYearResult] =
    await Promise.all([
      supabaseServer
        .from('transactions')
        .select('date, amount, category, status')
        .eq('client_id', clientId),

      // Most recently purchased active vehicle
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

  const vehicle  = vehicleResult.data
  const tyRow    = taxYearResult.data
  const priorTY  = priorYearResult.data
  const all      = txResult.data ?? []

  // ── Filter transactions to tax year window ───────────────────────────────────
  const inYear     = all.filter((t) => t.date >= config.startDate && t.date <= config.endDate)
  const outOfRange = all.filter((t) => t.date < config.startDate || t.date > config.endDate)
  const approved   = inYear.filter((t) => t.status === 'auto_approved' || t.status === 'reviewed')
  const flagged    = inYear.filter((t) => t.status === 'flagged')

  // ── Vehicle method and derived inputs ────────────────────────────────────────
  const vehicleMethod: VehicleMethod = (vehicle?.expense_method as VehicleMethod | null) ?? 'mileage'
  const businessUsePct = vehicle?.business_use_percent ?? 100

  // Whether this is the vehicle's first year of use
  const isYearOne = !!(
    vehicle &&
    !vehicle.expense_method_locked &&
    vehicle.purchase_date >= config.startDate &&
    vehicle.purchase_date <= config.endDate
  )

  // Whether the vehicle was disposed of in this tax year
  const isDisposalYear = !!(
    vehicle?.disposal_date &&
    vehicle.disposal_date >= config.startDate &&
    vehicle.disposal_date <= config.endDate
  )

  // Fuel transactions (isVehicle=true) are excluded from nonVehicleExpenses by
  // the calculator. For actual/rental methods we sum them here and pass them back
  // in as actualCostsGross / rentalCosts so they re-enter as vehicle deductions.
  const fuelTotal = approved
    .filter((t) => t.category === 'fuel' && Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  // ── Capital allowance inputs (actual method only) ────────────────────────────
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

  // ── Prior year POA already paid (for balancing payment, C-47) ────────────────
  const poa1Paid = (priorTY?.poa1_paid && priorTY?.poa1_amount) ? Number(priorTY.poa1_amount) : 0
  const poa2Paid = (priorTY?.poa2_paid && priorTY?.poa2_amount) ? Number(priorTY.poa2_amount) : 0

  // ── Student loan active plans ────────────────────────────────────────────────
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
      actualCostsGross:     vehicleMethod === 'actual'  ? fuelTotal    : undefined,
      rentalCosts:          vehicleMethod === 'rental'  ? fuelTotal    : undefined,
      businessUsePct,
      openingPoolValue,
      vehicleAdditions,
      co2Gkm:               vehicle?.co2_gkm            ?? undefined,
      isYearOne,
      isDisposalYear,
      disposalProceeds:     isDisposalYear && vehicle?.disposal_proceeds
                              ? Number(vehicle.disposal_proceeds) : undefined,
      otherIncome,
      overlapRelief:        tyRow?.overlap_relief_claimed   ? Number(tyRow.overlap_relief_claimed)   : 0,
      lossesBroughtForward: tyRow?.losses_brought_forward   ? Number(tyRow.losses_brought_forward)   : 0,
      poa1Paid,
      poa2Paid,
      sa303Elected:         tyRow?.sa303_elected             ?? false,
      sa303Amount:          tyRow?.sa303_reduced_amount      ? Number(tyRow.sa303_reduced_amount)    : undefined,
      studentLoanPlans,
      flaggedTransactionCount:    flagged.length,
      outOfRangeTransactionCount: outOfRange.length,
    },
  )
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface ClientDocument {
  id:                  string
  client_id:           string
  tax_year:            string
  category:            string
  file_url:            string
  file_name:           string
  file_type:           string
  expense_amount:      number | null
  needs_review:        boolean
  accountant_reviewed: boolean
  uploaded_by:         string
  upload_date:         string
}

/**
 * Save a document record after the file has been uploaded to Supabase Storage.
 * Auto-flags for review if the expense amount exceeds £200.
 */
export async function saveDocumentRecord(
  clientId:      string,
  taxYear:       string,
  category:      string,
  fileUrl:       string,
  fileName:      string,
  fileType:      string,
  expenseAmount?: number,
): Promise<ClientDocument> {
  const needsReview = typeof expenseAmount === 'number' && expenseAmount > 200

  const { data, error } = await supabaseServer
    .from('documents')
    .insert({
      client_id:           clientId,
      tax_year:            taxYear,
      category,
      file_url:            fileUrl,
      file_name:           fileName,
      file_type:           fileType,
      expense_amount:      expenseAmount ?? null,
      needs_review:        needsReview,
      accountant_reviewed: false,
      uploaded_by:         'accountant',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as ClientDocument
}

/**
 * Fetch all documents for a client and tax year, newest first.
 */
export async function getClientDocuments(
  clientId: string,
  taxYear:  string,
): Promise<ClientDocument[]> {
  const { data, error } = await supabaseServer
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .order('upload_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientDocument[]
}

/**
 * Mark a document as reviewed by the accountant.
 * Auto-resolves the document_over_200_unreviewed flag if no docs still need review.
 */
export async function markDocumentReviewed(
  documentId: string,
  clientId:   string,
  taxYear:    string,
): Promise<void> {
  const { error } = await supabaseServer
    .from('documents')
    .update({ accountant_reviewed: true, needs_review: false })
    .eq('id', documentId)

  if (error) throw new Error(error.message)

  const { count } = await supabaseServer
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .eq('needs_review', true)

  if ((count ?? 0) === 0) {
    await supabaseServer
      .from('flags')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('tax_year', taxYear)
      .eq('flag_type', 'document_over_200_unreviewed')
      .eq('status', 'open')
  }
}
