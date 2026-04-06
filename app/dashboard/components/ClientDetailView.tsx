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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 ${
          confidence >= 90 ? 'bg-emerald-50 border-b border-emerald-100'
          : confidence >= 70 ? 'bg-amber-50 border-b border-amber-100'
          : 'bg-red-50 border-b border-red-100'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">
                {new Date(transaction.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h3 className="text-lg font-bold text-gray-900">
                {transaction.merchant ?? transaction.description ?? '—'}
              </h3>
              <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${amt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {amt >= 0 ? `+£${amt.toFixed(2)}` : `-£${Math.abs(amt).toFixed(2)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {transaction.review_reason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
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
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                {CATEGORY_LABELS[cat] ?? transaction.category}
              </span>
            </div>
            {src && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Classification</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${SOURCE_CONFIG[src]?.className ?? 'bg-gray-100 text-gray-600'}`}>
                  {SOURCE_CONFIG[src]?.label ?? src}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-sm font-bold tabular-nums ${
                confidence >= 90 ? 'text-emerald-600'
                : confidence >= 70 ? 'text-amber-600'
                : 'text-red-600'
              }`}>{confidence}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  confidence >= 90 ? 'bg-emerald-500'
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
              <blockquote className="text-sm text-gray-700 leading-relaxed bg-gray-50 border-l-4 border-indigo-300 px-4 py-3 rounded-r-lg italic">
                {transaction.reasoning}
              </blockquote>
            </div>
          )}

          {matchSrc && (
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-600">Evidence match</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MATCH_SOURCE_CONFIG[matchSrc]?.className ?? 'bg-gray-100 text-gray-500'}`}>
                {MATCH_SOURCE_CONFIG[matchSrc]?.label ?? matchSrc}
              </span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-colors cursor-pointer"
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
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <p className="text-xs text-gray-500 font-medium">Total Transactions</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-gray-900">{savedTransactions.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="text-xs text-gray-500 font-medium">Total Income</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-emerald-700">£{income.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <p className="text-xs text-gray-500 font-medium">Total Expenses</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-red-600">£{expenses.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                            {CATEGORY_LABELS[cat] ?? t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${confidenceBadgeClass(t.confidence_score)}`}>
                            {t.confidence_score}%
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'auto_approved' || t.status === 'reviewed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : t.status === 'flagged'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
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
