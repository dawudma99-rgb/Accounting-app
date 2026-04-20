'use client'

import { useState } from 'react'
import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@/types/transaction'
import type { DashboardTransaction } from '../types'
import { CATEGORY_LABELS, CONFIDENCE_OPTIONS, SOURCE_OPTIONS } from '../constants'
import { SpinnerIcon, CheckIcon } from './icons'

export function BulkApproveBar({
  transactions,
  onApprove,
  isSaving,
}: {
  transactions: DashboardTransaction[]
  onApprove: (eligible: DashboardTransaction[]) => void
  isSaving: boolean
}) {
  const [confidenceMin,  setConfidenceMin]  = useState(0)
  const [sourceFilter,   setSourceFilter]   = useState<DashboardTransaction['source'] | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | 'all'>('all')

  const eligible = transactions.filter((t) => {
    if (t.source === 'rules' || t.source === 'memory') return false
    if (t.confidence < confidenceMin) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    return true
  })

  const categoryOptions: Array<{ label: string; value: TransactionCategory | 'all' }> = [
    { label: 'All categories', value: 'all' },
    ...TRANSACTION_CATEGORIES.map((c) => ({ label: CATEGORY_LABELS[c], value: c })),
  ]

  return (
    <div className="bg-white rounded-md border border-gray-200 px-5 py-3.5 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-gray-700 flex-none">Bulk approve</span>

      <select
        value={confidenceMin}
        onChange={(e) => setConfidenceMin(Number(e.target.value))}
        className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        {CONFIDENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={sourceFilter}
        onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
        className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
        className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
      >
        {categoryOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <div className="flex-1" />

      <span className="text-xs text-gray-400">
        {eligible.length} transaction{eligible.length !== 1 ? 's' : ''} match
      </span>

      <button
        onClick={() => onApprove(eligible)}
        disabled={isSaving || eligible.length === 0}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors cursor-pointer"
      >
        {isSaving ? (
          <><SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> Saving…</>
        ) : (
          <><CheckIcon className="w-3.5 h-3.5" /> Save {eligible.length} rule{eligible.length !== 1 ? 's' : ''} to rulebook</>
        )}
      </button>
    </div>
  )
}
