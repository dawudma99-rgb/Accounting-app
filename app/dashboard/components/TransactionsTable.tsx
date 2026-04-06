'use client'

import type { DashboardTransaction } from '../types'
import {
  CATEGORY_LABELS, CATEGORY_COLORS,
  MATCH_SOURCE_CONFIG, SOURCE_CONFIG,
} from '../constants'
import { formatAmount, confidenceRowClass, confidenceBadgeClass } from '../helpers'
import {
  ListIcon, AlertIcon, ChevronRightIcon,
  XIcon, BrainIcon, ReceiptIcon, CheckIcon,
} from './icons'

// ─── Detail Modal ─────────────────────────────────────────────────────────────

export function DetailModal({
  transaction, onClose, onApprove, onRecategorise,
}: {
  transaction: DashboardTransaction
  onClose: () => void
  onApprove: (id: string) => void
  onRecategorise: (id: string) => void
}) {
  const match = MATCH_SOURCE_CONFIG[transaction.matchSource]
  const src   = SOURCE_CONFIG[transaction.source]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className={`px-6 py-5 ${
          transaction.confidence >= 90 ? 'bg-emerald-50 border-b border-emerald-100'
          : transaction.confidence >= 70 ? 'bg-amber-50 border-b border-amber-100'
          : 'bg-red-50 border-b border-red-100'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">{transaction.date}</p>
              <h3 className="text-lg font-bold text-gray-900">{transaction.merchant}</h3>
              <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${transaction.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatAmount(transaction.amount)}
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

        <div className="px-6 py-5 space-y-4">
          {transaction.reviewReason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Flagged for review</p>
                <p className="text-xs text-amber-600 mt-0.5">{transaction.reviewReason}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">Category</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${CATEGORY_COLORS[transaction.category]}`}>
                {CATEGORY_LABELS[transaction.category]}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Classification</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${src.className}`}>
                {src.label}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-sm font-bold tabular-nums ${
                transaction.confidence >= 90 ? 'text-emerald-600'
                : transaction.confidence >= 70 ? 'text-amber-600'
                : 'text-red-600'
              }`}>{transaction.confidence}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  transaction.confidence >= 90 ? 'bg-emerald-500'
                  : transaction.confidence >= 70 ? 'bg-amber-400'
                  : 'bg-red-500'
                }`}
                style={{ width: `${transaction.confidence}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <BrainIcon className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-400">AI Reasoning</p>
            </div>
            <blockquote className="text-sm text-gray-700 leading-relaxed bg-gray-50 border-l-4 border-indigo-300 px-4 py-3 rounded-r-lg italic">
              {transaction.reasoning}
            </blockquote>
          </div>

          <div className="flex flex-col gap-1.5 py-3 px-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-600">Evidence match</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${match.className}`}>
                {match.label}
              </span>
            </div>
            {transaction.matchedReceipt && (
              <div className="mt-1 text-xs text-gray-500 space-y-0.5 pl-6">
                <p><span className="font-medium">Receipt:</span> {transaction.matchedReceipt.fileName}</p>
                <p><span className="font-medium">Merchant:</span> {transaction.matchedReceipt.merchant}</p>
                <p><span className="font-medium">Amount:</span> £{transaction.matchedReceipt.amount.toFixed(2)}</p>
                <p><span className="font-medium">Date:</span> {transaction.matchedReceipt.date}</p>
                <p><span className="font-medium">Clarity:</span> {transaction.matchedReceipt.confidence}%</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => { onApprove(transaction.id); onClose() }}
            disabled={transaction.status === 'approved'}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckIcon className="w-4 h-4" />
            {transaction.status === 'approved' ? 'Already approved' : 'Approve & remember'}
          </button>
          <button
            onClick={() => { onRecategorise(transaction.id); onClose() }}
            className="flex-1 py-2.5 border-2 border-gray-200 hover:border-indigo-400 hover:text-indigo-600 text-gray-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Recategorise
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transactions Table ───────────────────────────────────────────────────────

export function TransactionsTable({
  transactions, onSelect,
}: {
  transactions: DashboardTransaction[]
  onSelect: (t: DashboardTransaction) => void
}) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <ListIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No transactions yet</p>
          <p className="text-xs text-gray-400 mt-1">Upload a bank statement and click Run Categorisation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Transactions
          <span className="ml-2 text-xs font-normal text-gray-400">{transactions.length} records</span>
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-200 inline-block" />90%+</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-200 inline-block" />70–89%</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-200 inline-block" />&lt;70%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Merchant</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((t) => {
              const match = MATCH_SOURCE_CONFIG[t.matchSource]
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className={`cursor-pointer transition-colors ${confidenceRowClass(t.confidence)}`}
                >
                  <td className="px-6 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[180px] truncate">
                    {t.merchant}
                    {t.reviewReason && (
                      <span className="ml-1.5 inline-flex items-center">
                        <AlertIcon className="w-3 h-3 text-amber-500" />
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${t.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatAmount(t.amount)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[t.category]}`}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${confidenceBadgeClass(t.confidence)}`}>
                      {t.confidence}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${match.className}`}>
                      {match.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : t.status === 'flagged'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.status === 'approved' ? 'Approved' : t.status === 'flagged' ? 'Flagged' : 'Pending'}
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
    </div>
  )
}
