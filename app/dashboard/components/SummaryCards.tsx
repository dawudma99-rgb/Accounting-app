'use client'

import type { DashboardTransaction } from '../types'

export function SummaryCards({ transactions }: { transactions: DashboardTransaction[] }) {
  const income   = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const approved = transactions.filter((t) => t.status === 'approved').length
  const flagged  = transactions.filter((t) => t.status === 'flagged').length

  const cards = [
    { label: 'Total Transactions', value: transactions.length.toString(), sub: 'this period',
      color: 'text-gray-900', dot: 'bg-slate-400' },
    { label: 'Total Income',  value: `£${income.toFixed(2)}`,
      sub: `${transactions.filter((t) => t.amount > 0).length} transactions`,
      color: 'text-emerald-700', dot: 'bg-emerald-500' },
    { label: 'Total Expenses', value: `£${expenses.toFixed(2)}`,
      sub: `${transactions.filter((t) => t.amount < 0).length} transactions`,
      color: 'text-red-600', dot: 'bg-red-500' },
    { label: 'Auto-Approved', value: approved.toString(),
      sub: transactions.length > 0 ? `${Math.round((approved / transactions.length) * 100)}% of total` : '—',
      color: 'text-emerald-700', dot: 'bg-emerald-500' },
    { label: 'Flagged for Review', value: flagged.toString(), sub: 'need attention',
      color: flagged > 0 ? 'text-amber-600' : 'text-gray-400',
      dot:   flagged > 0 ? 'bg-amber-500'  : 'bg-gray-300' },
  ]

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full flex-none ${c.dot}`} />
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
          </div>
          <p className={`text-2xl font-bold tracking-tight ${c.color}`}>{c.value}</p>
          <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
