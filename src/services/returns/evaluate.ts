import { supabaseServer as supabase } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReturnStatus =
  | 'collecting'
  | 'ready_for_review'
  | 'under_review'
  | 'approved'
  | 'submitted'

export interface EvaluationBlocker {
  code:    string
  message: string
}

export interface EvaluationWarning {
  code:    string
  message: string
}

export interface ReturnEvaluation {
  clientId:               string
  taxYear:                string
  currentStatus:          ReturnStatus
  canAdvanceTo:           ReturnStatus | null
  blockers:               EvaluationBlocker[]
  warnings:               EvaluationWarning[]
  isReadyForSubmission:   boolean
}

// ─── Status transition map ────────────────────────────────────────────────────

const NEXT_STATUS: Record<ReturnStatus, ReturnStatus | null> = {
  collecting:       'ready_for_review',
  ready_for_review: 'under_review',
  under_review:     'approved',
  approved:         'submitted',
  submitted:        null,
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Single source of truth for return readiness.
 *
 * Reads from the database directly — never trusts in-memory state or
 * client-side flags. Called by server actions before any status advance,
 * and by the UI to render the current gate state.
 */
export async function evaluateReturn(
  clientId: string,
  taxYear: string,
): Promise<ReturnEvaluation> {
  const blockers: EvaluationBlocker[] = []
  const warnings: EvaluationWarning[] = []

  // ── Fetch all required data in parallel ──────────────────────────────────

  const [clientResult, taxYearResult, vehiclesResult, openFlagsResult] =
    await Promise.all([
      supabase
        .from('clients')
        .select('utr, agent_authorised, aml_checked, loe_signed_date')
        .eq('id', clientId)
        .single(),

      supabase
        .from('tax_years')
        .select('return_status, sa302_unavailable, gross_income, figures_saved_at')
        .eq('client_id', clientId)
        .eq('tax_year', taxYear)
        .maybeSingle(),

      supabase
        .from('vehicles')
        .select('registration, expense_method')
        .eq('client_id', clientId),

      supabase
        .from('flags')
        .select('flag_type, description, status')
        .eq('client_id', clientId)
        .in('status', ['open']),
    ])

  if (clientResult.error) throw new Error(`[evaluate] client fetch failed: ${clientResult.error.message}`)
  if (vehiclesResult.error) throw new Error(`[evaluate] vehicles fetch failed: ${vehiclesResult.error.message}`)

  const client   = clientResult.data
  const tyRow    = taxYearResult.data
  const vehicles = vehiclesResult.data ?? []
  const flags    = openFlagsResult.data ?? []

  const currentStatus: ReturnStatus = (tyRow?.return_status as ReturnStatus | undefined) ?? 'collecting'

  // ── Blocking: open action-severity flags ─────────────────────────────────

  const ACTION_FLAGS = new Set([
    'missing_identity_fields',
    'missing_sa_registration_date',
    'agent_not_authorised',
    'aml_not_checked',
    'loe_not_signed',
    'expense_method_not_elected',
    'missing_mileage_log',
    'unresolved_transactions',
  ])

  for (const flag of flags) {
    if (ACTION_FLAGS.has(flag.flag_type)) {
      blockers.push({ code: flag.flag_type, message: flag.description })
    } else {
      warnings.push({ code: flag.flag_type, message: flag.description })
    }
  }

  // ── Blocking: hard client-record checks (belt-and-braces, independent of flags) ──

  if (!client.utr) {
    if (!blockers.some((b) => b.code === 'missing_identity_fields')) {
      blockers.push({ code: 'missing_utr', message: 'UTR not recorded — required before filing.' })
    }
  }

  if (!client.agent_authorised) {
    if (!blockers.some((b) => b.code === 'agent_not_authorised')) {
      blockers.push({ code: 'agent_not_authorised', message: '64-8 agent authorisation not confirmed.' })
    }
  }

  if (!client.aml_checked) {
    if (!blockers.some((b) => b.code === 'aml_not_checked')) {
      blockers.push({ code: 'aml_not_checked', message: 'AML check not completed.' })
    }
  }

  if (!client.loe_signed_date) {
    if (!blockers.some((b) => b.code === 'loe_not_signed')) {
      blockers.push({ code: 'loe_not_signed', message: 'Letter of Engagement not signed.' })
    }
  }

  // ── Blocking: mileage log required for mileage-method vehicles ───────────

  const mileageVehicles = vehicles.filter((v) => v.expense_method === 'mileage')
  if (mileageVehicles.length > 0) {
    const { data: logs } = await supabase
      .from('mileage_logs')
      .select('id')
      .eq('client_id', clientId)
      .eq('tax_year', taxYear)
      .limit(1)
      .maybeSingle()

    if (!logs) {
      if (!blockers.some((b) => b.code === 'missing_mileage_log')) {
        blockers.push({
          code:    'missing_mileage_log',
          message: 'Mileage method elected but no mileage log uploaded or entered.',
        })
      }
    }
  }

  // ── Blocking: figures must be saved before advancing ─────────────────────

  if (!tyRow?.figures_saved_at) {
    blockers.push({
      code:    'figures_not_saved',
      message: 'Tax figures have not been saved. Open Tax Summary, review the calculations, then click "Save figures".',
    })
  }

  // ── Warning: SA302 unavailable ────────────────────────────────────────────

  if (tyRow?.sa302_unavailable) {
    warnings.push({
      code:    'sa302_unavailable',
      message: 'SA302 unavailable — prior-year POA credit set to zero. January payment may be higher.',
    })
  }

  // ── Determine whether the return can advance ──────────────────────────────

  const isBlocked = blockers.length > 0
  const nextStatus = NEXT_STATUS[currentStatus]

  // Once submitted, no further advance is possible regardless
  const canAdvanceTo = currentStatus === 'submitted'
    ? null
    : isBlocked
      ? null
      : nextStatus

  const isReadyForSubmission = currentStatus === 'approved' && !isBlocked

  return {
    clientId,
    taxYear,
    currentStatus,
    canAdvanceTo,
    blockers,
    warnings,
    isReadyForSubmission,
  }
}

// ─── Status advance (enforced) ────────────────────────────────────────────────

/**
 * Advance a return to the next status.
 * Throws if blockers are present or the transition is invalid.
 */
export async function advanceReturnStatus(
  clientId: string,
  taxYear: string,
  to: ReturnStatus,
): Promise<ReturnEvaluation> {
  const evaluation = await evaluateReturn(clientId, taxYear)

  if (evaluation.canAdvanceTo !== to) {
    if (evaluation.blockers.length > 0) {
      const codes = evaluation.blockers.map((b) => b.code).join(', ')
      throw new Error(`Return cannot advance: ${codes}`)
    }
    throw new Error(
      `Invalid transition: ${evaluation.currentStatus} → ${to}. Expected: ${evaluation.canAdvanceTo ?? 'none'}.`,
    )
  }

  const { error } = await supabase
    .from('tax_years')
    .update({ return_status: to })
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)

  if (error) throw new Error(`[evaluate] status update failed: ${error.message}`)

  return { ...evaluation, currentStatus: to, canAdvanceTo: NEXT_STATUS[to] }
}
