'use client'

import { useState, useEffect } from 'react'
import type { TransactionCategory } from '@/types/transaction'
import { getClientTransactions } from '../actions'
import type { ClientRecord, SavedTransaction } from '../actions'
import type { DashboardTransaction, MatchSource } from '../types'
import {
  CATEGORY_LABELS, CATEGORY_COLORS,
  MATCH_SOURCE_CONFIG, SOURCE_CONFIG,
  BUSINESS_TYPE_LABELS,
} from '../constants'
import { confidenceRowClass, confidenceBadgeClass } from '../helpers'
import {
  SpinnerIcon, ChevronLeftIcon, ChevronRightIcon,
  AlertIcon, BrainIcon, ReceiptIcon, XIcon,
} from './icons'

// ─── History Detail Modal ─────────────────────────────────────────────────────

function HistoryDetailModal({
  transaction,
  onClose,
}: {
  transaction: SavedTransaction
  onClose: () => void
}) {
  const amt        = Number(transaction.amount)
  const confidence = transaction.confidence_score
  const cat        = transaction.category as TransactionCategory
  const src        = transaction.source as DashboardTransaction['source'] | null
  const matchSrc   = transaction.match_source as MatchSource | null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-0.5 uppercase tracking-wide">
                {new Date(transaction.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h3 className="text-base font-semibold text-zinc-900">
                {transaction.merchant ?? transaction.description ?? '—'}
              </h3>
              <p className={`text-xl font-semibold mt-1 font-mono tabular-nums ${amt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {amt >= 0 ? `+£${amt.toFixed(2)}` : `-£${Math.abs(amt).toFixed(2)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {transaction.review_reason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Flagged for review</p>
                <p className="text-xs text-amber-600 mt-0.5">{transaction.review_reason}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">Category</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${CATEGORY_COLORS[cat] ?? 'bg-zinc-100 text-zinc-700'}`}>
                {CATEGORY_LABELS[cat] ?? transaction.category}
              </span>
            </div>
            {src && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Classification</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${SOURCE_CONFIG[src]?.className ?? 'bg-zinc-100 text-zinc-700'}`}>
                  {SOURCE_CONFIG[src]?.label ?? src}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-sm font-semibold tabular-nums ${
                confidence >= 90 ? 'text-zinc-700'
                : confidence >= 70 ? 'text-amber-600'
                : 'text-red-600'
              }`}>{confidence}%</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-sm overflow-hidden">
              <div
                className={`h-full transition-all ${
                  confidence >= 90 ? 'bg-zinc-400'
                  : confidence >= 70 ? 'bg-amber-400'
                  : 'bg-red-500'
                }`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          {transaction.reasoning && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <BrainIcon className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs text-gray-400">AI Reasoning</p>
              </div>
              <blockquote className="text-sm text-gray-700 leading-relaxed bg-zinc-50 border-l-4 border-zinc-300 px-4 py-3 italic">
                {transaction.reasoning}
              </blockquote>
            </div>
          )}

          {matchSrc && (
            <div className="flex items-center justify-between py-3 px-4 bg-zinc-50 rounded border border-zinc-100">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-600">Evidence match</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium ${MATCH_SOURCE_CONFIG[matchSrc]?.className ?? 'bg-zinc-100 text-zinc-500'}`}>
                {MATCH_SOURCE_CONFIG[matchSrc]?.label ?? matchSrc}
              </span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-zinc-300 hover:border-zinc-400 text-zinc-600 text-sm font-medium rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Detail View ───────────────────────────────────────────────────────

export function ClientDetailView({
  client,
  onBack,
}: {
  client: ClientRecord
  onBack: () => void
}) {
  const [savedTransactions, setSavedTransactions] = useState<SavedTransaction[]>([])
  const [loading,           setLoading]           = useState(true)
  const [selected,          setSelected]          = useState<SavedTransaction | null>(null)

  useEffect(() => {
    getClientTransactions(client.id)
      .then(setSavedTransactions)
      .finally(() => setLoading(false))
  }, [client.id])

  const income   = savedTransactions.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
  const expenses = savedTransactions.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Clients
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <div>
            <h1 className="text-base font-semibold text-gray-900">{client.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{BUSINESS_TYPE_LABELS[client.business_type]}</p>
          </div>
        </div>
        {client.utr && (
          <span className="text-xs text-gray-400 font-mono">UTR: {client.utr}</span>
        )}
      </div>

      <div className="px-8 py-6 space-y-5 max-w-7xl">
        {!loading && savedTransactions.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-sm bg-slate-400" />
                <p className="text-xs text-gray-500 font-medium">Total Transactions</p>
              </div>
              <p className="text-xl font-semibold tracking-tight tabular-nums text-gray-900">{savedTransactions.length}</p>
            </div>
            <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                <p className="text-xs text-gray-500 font-medium">Total Income</p>
              </div>
              <p className="text-xl font-semibold tracking-tight tabular-nums text-emerald-700">£{income.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-sm bg-red-500" />
                <p className="text-xs text-gray-500 font-medium">Total Expenses</p>
              </div>
              <p className="text-xl font-semibold tracking-tight tabular-nums text-red-600">£{expenses.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Transaction History
              {!loading && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {savedTransactions.length} record{savedTransactions.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <SpinnerIcon className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : savedTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-gray-500">No transactions yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Select this client on the Dashboard and run a categorisation to save results here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Merchant</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {savedTransactions.map((t) => {
                    const amt = Number(t.amount)
                    const cat = t.category as TransactionCategory
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`cursor-pointer transition-colors ${confidenceRowClass(t.confidence_score)}`}
                      >
                        <td className="px-6 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {new Date(t.date).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[200px] truncate">
                          {t.merchant ?? t.description ?? '—'}
                          {t.review_reason && (
                            <span className="ml-1.5 inline-flex items-center">
                              <AlertIcon className="w-3 h-3 text-amber-500" />
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${amt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {amt >= 0 ? `+£${amt.toFixed(2)}` : `-£${Math.abs(amt).toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${CATEGORY_COLORS[cat] ?? 'bg-zinc-100 text-zinc-700'}`}>
                            {CATEGORY_LABELS[cat] ?? t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold tabular-nums ${confidenceBadgeClass(t.confidence_score)}`}>
                            {t.confidence_score}%
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${
                            t.status === 'auto_approved' || t.status === 'reviewed'
                              ? 'bg-zinc-100 text-zinc-700'
                              : t.status === 'flagged'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-zinc-100 text-zinc-500'
                          }`}>
                            {t.status === 'auto_approved' ? 'Approved'
                              : t.status === 'reviewed' ? 'Reviewed'
                              : t.status === 'flagged'   ? 'Flagged'
                              : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-300">
                          <ChevronRightIcon className="w-4 h-4" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <HistoryDetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
