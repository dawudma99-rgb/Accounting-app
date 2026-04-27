'use client'

import { useState } from 'react'
import { resolveFlag } from '../actions'
import type { ClientFlag } from '../actions'
import { AlertIcon, CheckIcon, XIcon } from './icons'

// ─── Flag metadata ────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  missing_identity_fields:       'Missing identity fields (name, DOB, NI, UTR)',
  missing_sa_registration_date:  'SA registration date not recorded',
  agent_not_authorised:          '64-8 agent authorisation not confirmed',
  aml_not_checked:               'AML check not completed',
  loe_not_signed:                'Letter of Engagement not signed',
  missing_student_loan_plans:    'Student loan plan not recorded',
  missing_platforms:             'No platforms recorded',
  missing_vehicle_ownership_type:'Vehicle ownership type not set',
  expense_method_not_elected:    'Vehicle expense method not elected',
  missing_pool_value:            'Capital allowance pool value missing',
  vehicle_disposal_incomplete:   'Vehicle disposal details incomplete',
  losses_carried_forward:        'Losses carried forward — action required',
  sa302_unavailable:             'SA302 unavailable',
  mtd_signup_missing:            'MTD sign-up date not recorded',
  mtd_penalty_points:            'MTD penalty points approaching £200 threshold',
  document_over_200_unreviewed:  'Document over £200 not reviewed',
  missing_mileage_log:           'No mileage log — submission blocked',
  export_log_missing:            'No export log recorded',
  business_use_over_90:          'Business use over 90% — mileage log required',
  bank_variance:                 'Bank statement variance flagged',
  income_approaching_100k:       'Income approaching £100k — personal allowance taper',
}

// Flags that block submission or require accountant action
const ACCOUNTANT_ACTION_FLAGS = new Set([
  'agent_not_authorised',
  'aml_not_checked',
  'loe_not_signed',
  'expense_method_not_elected',
  'vehicle_disposal_incomplete',
  'losses_carried_forward',
  'sa302_unavailable',
  'mtd_signup_missing',
  'document_over_200_unreviewed',
  'missing_mileage_log',
  'income_approaching_100k',
])

// ─── Override modal ───────────────────────────────────────────────────────────

function OverrideModal({
  flag,
  onClose,
  onConfirm,
}: {
  flag: ClientFlag
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-zinc-200">
        <div className="px-6 py-5 border-b border-zinc-200 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Override flag</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{FLAG_LABELS[flag.flag_type] ?? flag.flag_type}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-zinc-500">
            Record your reason for overriding this flag. This will be stored against the client record.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for override…"
            rows={3}
            className="w-full text-sm border border-zinc-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
          />
        </div>
        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-zinc-300 rounded text-zinc-600 hover:bg-zinc-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded font-medium cursor-pointer"
          >
            Confirm override
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single flag row ──────────────────────────────────────────────────────────

function FlagRow({
  flag,
  onResolved,
}: {
  flag: ClientFlag
  onResolved: (id: string) => void
}) {
  const [resolving,     setResolving]     = useState(false)
  const [showOverride,  setShowOverride]  = useState(false)
  const isAccountantAction = ACCOUNTANT_ACTION_FLAGS.has(flag.flag_type)

  async function handleResolve() {
    setResolving(true)
    await resolveFlag(flag.id, 'resolved')
    onResolved(flag.id)
  }

  async function handleOverride(reason: string) {
    setResolving(true)
    setShowOverride(false)
    await resolveFlag(flag.id, 'overridden', reason)
    onResolved(flag.id)
  }

  return (
    <>
      <div className={`flex items-start gap-3 px-4 py-3.5 border-b border-zinc-100 last:border-0 ${isAccountantAction ? 'bg-red-50/40' : ''}`}>
        <div className={`mt-0.5 flex-none w-4 h-4 ${isAccountantAction ? 'text-red-500' : 'text-amber-500'}`}>
          <AlertIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide ${
              isAccountantAction
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {isAccountantAction ? 'Accountant action' : 'Auto'}
            </span>
            {flag.tax_year && (
              <span className="text-[10px] text-zinc-400">{flag.tax_year}</span>
            )}
          </div>
          <p className="text-xs font-medium text-zinc-800 mt-1">
            {FLAG_LABELS[flag.flag_type] ?? flag.flag_type}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{flag.description}</p>
          <p className="text-[10px] text-zinc-400 mt-1">
            Raised {new Date(flag.raised_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-none">
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-100 disabled:opacity-40 cursor-pointer transition-colors"
          >
            <CheckIcon className="w-3 h-3" />
            Resolve
          </button>
          {isAccountantAction && (
            <button
              onClick={() => setShowOverride(true)}
              disabled={resolving}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 border border-amber-200 rounded hover:bg-amber-50 disabled:opacity-40 cursor-pointer transition-colors"
            >
              Override
            </button>
          )}
        </div>
      </div>

      {showOverride && (
        <OverrideModal
          flag={flag}
          onClose={() => setShowOverride(false)}
          onConfirm={handleOverride}
        />
      )}
    </>
  )
}

// ─── Flags panel ──────────────────────────────────────────────────────────────

function TestingModeBanner() {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
      <span className="font-bold flex-none mt-0.5">⚠</span>
      <div>
        <span className="font-semibold">Testing mode: </span>
        profile and vehicle flags are suppressed. Build the client profile UI and vehicle management UI, then set{' '}
        <code className="font-mono bg-amber-100 px-1 rounded">SUPPRESS_SETUP_FLAGS = false</code>{' '}
        in <code className="font-mono bg-amber-100 px-1 rounded">src/services/flags/index.ts</code> to re-enable them.
      </div>
    </div>
  )
}

export function FlagsPanel({
  initialFlags,
}: {
  initialFlags: ClientFlag[]
}) {
  const [flags, setFlags] = useState<ClientFlag[]>(initialFlags)

  function handleResolved(id: string) {
    setFlags((prev) => prev.filter((f) => f.id !== id))
  }

  const actionCount = flags.filter((f) => ACCOUNTANT_ACTION_FLAGS.has(f.flag_type)).length
  const autoCount   = flags.length - actionCount

  if (flags.length === 0) {
    return (
      <div className="space-y-2">
        <TestingModeBanner />
        <div className="bg-white rounded-md border border-gray-200 px-5 py-4 flex items-center gap-2.5">
          <CheckIcon className="w-4 h-4 text-emerald-500 flex-none" />
          <p className="text-sm text-zinc-600">No open flags — client record is complete.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
    <TestingModeBanner />
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Open Flags
            <span className="ml-2 text-xs font-normal text-gray-400">{flags.length} open</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {actionCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-700">
              {actionCount} action required
            </span>
          )}
          {autoCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-100 text-amber-700">
              {autoCount} warning
            </span>
          )}
        </div>
      </div>
      <div>
        {flags.map((flag) => (
          <FlagRow key={flag.id} flag={flag} onResolved={handleResolved} />
        ))}
      </div>
    </div>
    </div>
  )
}
