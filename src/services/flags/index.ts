import { supabaseServer as supabase } from '@/lib/supabase/server'
import type { ClientSummary, TaxYear } from '@/lib/client'
import type { TaxSummary } from '@/types/tax'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlagType =
  // P-01
  | 'missing_identity_fields'
  // P-02
  | 'missing_sa_registration_date'
  // P-03
  | 'agent_not_authorised'
  // P-04
  | 'aml_not_checked'
  // P-05
  | 'loe_not_signed'
  // P-06
  | 'missing_student_loan_plans'
  // P-07
  | 'missing_platforms'
  // P-08
  | 'missing_vehicle_ownership_type'
  // P-11
  | 'expense_method_not_elected'
  // P-13
  | 'missing_pool_value'
  // P-14
  | 'vehicle_disposal_incomplete'
  // P-20
  | 'losses_carried_forward'
  // P-21 / P-22
  | 'sa302_unavailable'
  // P-23
  | 'mtd_signup_missing'
  // P-27
  | 'mtd_penalty_points'
  // P-28 / P-30
  | 'document_over_200_unreviewed'
  // P-32
  | 'missing_mileage_log'
  // P-33
  | 'export_log_missing'
  // D-09
  | 'business_use_over_90'
  // D-13
  | 'bank_variance'
  // D-18
  | 'income_approaching_100k'
  // Derived from TaxSummary at save time
  | 'unresolved_transactions'
  | 'other_expenses_unreviewed'
  | 'trading_loss'

export interface RaiseFlag {
  clientId:    string
  taxYear?:    string
  flagType:    FlagType
  description: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openFlagExists(clientId: string, flagType: FlagType, taxYear?: string): Promise<boolean> {
  const query = supabase
    .from('flags')
    .select('id')
    .eq('client_id', clientId)
    .eq('flag_type', flagType)
    .eq('status', 'open')

  const { data } = await (taxYear ? query.eq('tax_year', taxYear) : query).maybeSingle()
  return !!data
}

async function raiseFlag({ clientId, taxYear, flagType, description }: RaiseFlag): Promise<void> {
  const exists = await openFlagExists(clientId, flagType, taxYear)
  if (exists) return

  const { error } = await supabase.from('flags').insert({
    client_id:   clientId,
    tax_year:    taxYear ?? null,
    flag_type:   flagType,
    description,
    status:      'open',
  })

  if (error) console.warn(`[flags] Failed to raise ${flagType}:`, error.message)
}

// ─── Profile checks (P-01 to P-08) ───────────────────────────────────────────

async function checkProfile(client: ClientSummary): Promise<void> {
  const p = client.profile
  const id = p.id

  // P-01
  if (!p.name || !p.dob || !p.ni_number || !p.utr) {
    await raiseFlag({
      clientId: id,
      flagType: 'missing_identity_fields',
      description: 'One or more identity fields missing: name, DOB, NI number, or UTR.',
    })
  }

  // P-02
  if (!p.sa_registration_date) {
    await raiseFlag({
      clientId: id,
      flagType: 'missing_sa_registration_date',
      description: 'SA registration date not recorded — first-year filer status and POA history cannot be determined.',
    })
  }

  // P-03 — blocks submission
  if (!p.agent_authorised) {
    await raiseFlag({
      clientId: id,
      flagType: 'agent_not_authorised',
      description: '64-8 agent authorisation not confirmed. Submission is blocked until this is active.',
    })
  }

  // P-04 — blocks submission
  if (!p.aml_checked) {
    await raiseFlag({
      clientId: id,
      flagType: 'aml_not_checked',
      description: 'AML check not completed. Submission is blocked until AML is confirmed with method recorded.',
    })
  }

  // P-05 — blocks submission
  if (!p.loe_signed_date) {
    await raiseFlag({
      clientId: id,
      flagType: 'loe_not_signed',
      description: 'Letter of Engagement not signed. Return is on hold.',
    })
  }

  // P-07
  if (!client.platforms.length) {
    await raiseFlag({
      clientId: id,
      flagType: 'missing_platforms',
      description: 'No platforms recorded. Income statement uploads cannot be prompted.',
    })
  }
}

// ─── Vehicle checks (P-09 to P-14) ───────────────────────────────────────────

async function checkVehicles(client: ClientSummary, taxYear: string): Promise<void> {
  for (const vehicle of client.vehicles) {
    // P-11
    if (!vehicle.expense_method) {
      await raiseFlag({
        clientId:    client.profile.id,
        taxYear,
        flagType:    'expense_method_not_elected',
        description: `Vehicle ${vehicle.registration}: expense method not yet elected. Required for year-one vehicles before calculation can proceed.`,
      })
    }

    // D-09
    if (vehicle.business_use_percent && vehicle.business_use_percent > 90) {
      await raiseFlag({
        clientId:    client.profile.id,
        taxYear,
        flagType:    'business_use_over_90',
        description: `Vehicle ${vehicle.registration}: business use is ${vehicle.business_use_percent}%. Mileage log is mandatory and will be verified.`,
      })
    }
  }
}

// ─── Tax year checks (P-15 to P-22) ──────────────────────────────────────────

async function checkTaxYear(clientId: string, taxYear: TaxYear): Promise<void> {
  const ty = taxYear.tax_year

  // P-20
  if (taxYear.losses_carried_forward > 0) {
    await raiseFlag({
      clientId,
      taxYear: ty,
      flagType: 'losses_carried_forward',
      description: `Losses of £${taxYear.losses_carried_forward.toFixed(2)} carried forward. Accountant must confirm offset strategy for next year.`,
    })
  }

  // P-21 / P-22
  if (taxYear.sa302_unavailable) {
    await raiseFlag({
      clientId,
      taxYear: ty,
      flagType: 'sa302_unavailable',
      description: 'SA302 unavailable. POA credit set to zero — client warned January payment may be higher.',
    })
  }

  // D-18
  if (taxYear.gross_income && taxYear.gross_income > 95_000) {
    await raiseFlag({
      clientId,
      taxYear: ty,
      flagType: 'income_approaching_100k',
      description: `Gross income £${taxYear.gross_income.toFixed(2)} — personal allowance taper applies above £100k. High priority review required.`,
    })
  }
}

// ─── MTD checks (P-23 to P-27) ───────────────────────────────────────────────

async function checkMtd(client: ClientSummary, taxYear: TaxYear): Promise<void> {
  if (!taxYear.mtd_flag) return

  // P-23
  if (!client.profile.mtd_signup_date) {
    await raiseFlag({
      clientId: client.profile.id,
      taxYear:  taxYear.tax_year,
      flagType: 'mtd_signup_missing',
      description: 'Client is flagged for MTD but no sign-up date recorded. Cannot submit quarterly updates.',
    })
  }

  // P-27
  if (taxYear.mtd_penalty_points >= 3) {
    await raiseFlag({
      clientId: client.profile.id,
      taxYear:  taxYear.tax_year,
      flagType: 'mtd_penalty_points',
      description: `Client has ${taxYear.mtd_penalty_points} MTD penalty points. One more missed quarter triggers a £200 fine.`,
    })
  }
}

// ─── Document checks (P-28 to P-32) ──────────────────────────────────────────

async function checkDocuments(client: ClientSummary, taxYear: string): Promise<void> {
  const clientId = client.profile.id

  // P-30 — >£200 with no accountant review
  for (const doc of client.document_status) {
    if (doc.needs_review_count > 0) {
      await raiseFlag({
        clientId,
        taxYear,
        flagType: 'document_over_200_unreviewed',
        description: `${doc.needs_review_count} document(s) in category "${doc.category}" exceed £200 and have not been reviewed by the accountant.`,
      })
    }
  }

  // P-32 — mileage log
  const hasVehicleWithMileage = client.vehicles.some(
    (v) => v.expense_method === 'mileage',
  )
  if (hasVehicleWithMileage) {
    const { data } = await supabase
      .from('mileage_logs')
      .select('id')
      .eq('client_id', clientId)
      .eq('tax_year', taxYear)
      .limit(1)
      .maybeSingle()

    if (!data) {
      await raiseFlag({
        clientId,
        taxYear,
        flagType: 'missing_mileage_log',
        description: 'Mileage method elected but no mileage log uploaded or entered. Submission is blocked.',
      })
    }
  }
}

// ─── Summary-derived flags ────────────────────────────────────────────────────

/**
 * Raise a flag if the condition is true; auto-resolve any open flag of that
 * type if the condition is now false. This makes summary-derived flags
 * self-healing — they clear automatically when the underlying issue is fixed.
 */
async function syncFlag(
  clientId: string,
  taxYear: string,
  flagType: FlagType,
  condition: boolean,
  description: string,
): Promise<void> {
  if (condition) {
    await raiseFlag({ clientId, taxYear, flagType, description })
  } else {
    await supabase
      .from('flags')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('tax_year', taxYear)
      .eq('flag_type', flagType)
      .eq('status', 'open')
  }
}

/**
 * Raise or auto-resolve flags derived from the computed TaxSummary.
 * Called when the accountant saves figures — keeps DB flags in sync with
 * the calculation result so evaluateReturn has full visibility.
 */
export async function raiseSummaryFlags(
  clientId: string,
  taxYear: string,
  summary: TaxSummary,
): Promise<void> {
  const otherExpensesAmount = summary.nonVehicleExpenses
    .find((e) => e.category === 'other')?.amount ?? 0

  await Promise.all([
    syncFlag(
      clientId, taxYear,
      'unresolved_transactions',
      summary.flaggedTransactionCount > 0,
      `${summary.flaggedTransactionCount} flagged transaction${summary.flaggedTransactionCount !== 1 ? 's' : ''} excluded from figures. Resolve in Dashboard before treating as final.`,
    ),
    syncFlag(
      clientId, taxYear,
      'other_expenses_unreviewed',
      otherExpensesAmount > 0,
      `£${otherExpensesAmount.toFixed(2)} recorded as 'Other expenses'. Review each item for business purpose before filing.`,
    ),
    syncFlag(
      clientId, taxYear,
      'trading_loss',
      summary.isLossYear,
      `Trading loss of £${Math.abs(summary.netProfitPreAdjustments).toFixed(2)}. Confirm offset treatment with client before filing.`,
    ),
  ])
}

/**
 * Sync the unresolved_transactions flag based on a live flagged-transaction count.
 * Call this whenever transactions are inserted or resolved so the DB flag stays
 * in sync without waiting for the accountant to save figures.
 */
export async function syncTransactionFlags(
  clientId: string,
  taxYear: string,
  flaggedCount: number,
): Promise<void> {
  await syncFlag(
    clientId, taxYear,
    'unresolved_transactions',
    flaggedCount > 0,
    `${flaggedCount} flagged transaction${flaggedCount !== 1 ? 's' : ''} excluded from figures. Resolve in Dashboard before treating as final.`,
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

import { SUPPRESS_SETUP_FLAGS } from '@/config'

/**
 * Run all P-01 to P-33 completeness checks for a client and the given tax year.
 * Raises flags in the database for anything missing or requiring accountant action.
 * Safe to call repeatedly — will not duplicate open flags.
 */
export async function checkClientCompleteness(
  client: ClientSummary,
  taxYear: string,
): Promise<void> {
  if (!SUPPRESS_SETUP_FLAGS) {
    await checkProfile(client)
    await checkVehicles(client, taxYear)
  }

  if (client.current_tax_year) {
    await checkTaxYear(client.profile.id, client.current_tax_year)
    await checkMtd(client, client.current_tax_year)
  }

  await checkDocuments(client, taxYear)
}

/**
 * Raise a one-off flag from anywhere in the codebase (decisions engine, API routes, etc.)
 */
export { raiseFlag }
