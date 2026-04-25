'use client'

import { CheckIcon, AlertIcon, SpinnerIcon } from './icons'
import type { ReturnEvaluation, ReturnStatus } from '@/services/returns/evaluate'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReturnStatus, { label: string; badge: string; dot: string }> = {
  collecting:       { label: 'Collecting data',       badge: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400'    },
  ready_for_review: { label: 'Ready for review',       badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  under_review:     { label: 'Under review',           badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500'   },
  approved:         { label: 'Approved',               badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  submitted:        { label: 'Submitted to HMRC',      badge: 'bg-slate-800 text-white',       dot: 'bg-slate-400'   },
}

const ADVANCE_BUTTON: Partial<Record<ReturnStatus, string>> = {
  ready_for_review: 'Mark as ready for review',
  under_review:     'Start review',
  approved:         'Approve return',
  submitted:        'Submit to HMRC',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnStatusGate({
  evaluation,
  onAdvance,
  advancing = false,
}: {
  evaluation:  ReturnEvaluation
  onAdvance:   (to: ReturnStatus) => void
  advancing?:  boolean
}) {
  const { currentStatus, canAdvanceTo, blockers, warnings, isReadyForSubmission } = evaluation
  const statusCfg = STATUS_CONFIG[currentStatus]

  return (
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Return status</span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {blockers.length > 0 && (
            <span className="text-xs text-red-600 font-medium">
              {blockers.length} blocker{blockers.length !== 1 ? 's' : ''} — cannot advance
            </span>
          )}

          {canAdvanceTo && (
            <button
              onClick={() => onAdvance(canAdvanceTo)}
              disabled={advancing}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {advancing && <SpinnerIcon className="w-3 h-3 animate-spin" />}
              {ADVANCE_BUTTON[canAdvanceTo] ?? `Advance to ${canAdvanceTo}`}
            </button>
          )}

          {isReadyForSubmission && currentStatus === 'approved' && (
            <button
              onClick={() => onAdvance('submitted')}
              disabled={advancing}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {advancing ? (
                <SpinnerIcon className="w-3 h-3 animate-spin" />
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
              Submit to HMRC
            </button>
          )}
        </div>
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 space-y-2">
          {blockers.map((b) => (
            <div
              key={b.code}
              className="flex items-start gap-2.5 px-3 py-2 rounded border bg-red-50 border-red-200 text-xs text-red-700"
            >
              <AlertIcon className="w-3.5 h-3.5 text-red-400 flex-none mt-0.5" />
              <div>
                <span className="font-semibold capitalize">{b.code.replace(/_/g, ' ')}: </span>
                {b.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-6 py-3 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.code}
              className="flex items-start gap-2.5 px-3 py-2 rounded border bg-amber-50 border-amber-200 text-xs text-amber-700"
            >
              <span className="font-bold flex-none mt-0.5">⚠</span>
              <div>
                <span className="font-semibold capitalize">{w.code.replace(/_/g, ' ')}: </span>
                {w.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clean state */}
      {blockers.length === 0 && warnings.length === 0 && currentStatus !== 'submitted' && (
        <div className="px-6 py-3 flex items-center gap-2 text-xs text-emerald-700">
          <CheckIcon className="w-3.5 h-3.5 flex-none" />
          <span>No blockers or warnings — return is clean.</span>
        </div>
      )}

      {currentStatus === 'submitted' && (
        <div className="px-6 py-3 flex items-center gap-2 text-xs text-gray-500">
          <CheckIcon className="w-3.5 h-3.5 flex-none text-slate-400" />
          <span>Return submitted to HMRC. No further action required.</span>
        </div>
      )}
    </div>
  )
}
