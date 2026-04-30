import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BusinessType } from '@/types/transaction'
import type { UnmatchedPayout } from '@/services/matching/platform'
import { serialiseToCsv } from '@/lib/export/csv'
import type { ExportRow } from '@/lib/export/csv'
import {
  bulkConfirmTransactions,
  bulkMarkTransactionsReviewed,
  confirmTransaction,
  markTransactionReviewed,
} from '../actions'
import type { ClientRecord } from '../actions'
import type { DashboardTransaction, MerchantMemory } from '../types'

export function useTransactionActions(
  transactions: DashboardTransaction[],
  setTransactions: Dispatch<SetStateAction<DashboardTransaction[]>>,
  merchantMemory: MerchantMemory,
  setMerchantMemory: Dispatch<SetStateAction<MerchantMemory>>,
  unmatchedPayouts: UnmatchedPayout[],
  businessType: BusinessType,
  selectedClient: ClientRecord | null,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [isBulkSaving, setIsBulkSaving] = useState(false)

  function handleDownload(): void {
    const exportRows: ExportRow[] = [
      ...transactions.map((t) => ({
        date:        t.date,
        description: t.merchant || t.description,
        amount:      t.amount,
        category:    t.category,
        matchedTo:   t.matchedRow?.sourceLabel ?? 'Unmatched',
        confidence:  t.confidence,
      })),
      ...unmatchedPayouts.map((u) => ({
        date:        u.row.payoutDate,
        description: u.row.sourceLabel,
        amount:      u.row.netEarnings,
        category:    'income' as const,
        matchedTo:   `WARNING: ${u.reason}`,
        confidence:  0,
      })),
    ]

    const csv  = serialiseToCsv(exportRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleApprove(id: string): Promise<void> {
    const tx = transactions.find((t) => t.id === id)
    if (!tx) return

    const pattern = tx.matchedPattern ?? tx.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase()

    setTransactions((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: 'approved' as const, reviewReason: undefined } : t),
    )
    setMerchantMemory((m) => new Map(m).set(pattern, { category: tx.category, pattern }))

    try {
      await Promise.all([
        confirmTransaction(pattern, tx.category, businessType),
        markTransactionReviewed(tx.id, tx.category, selectedClient?.id ?? undefined),
      ])
    } catch {
      setTransactions((prev) =>
        prev.map((t) => t.id === id ? { ...t, status: tx.status, reviewReason: tx.reviewReason } : t),
      )
      setError('Failed to save rule — please try again.')
    }
  }

  async function handleBulkApprove(eligible: DashboardTransaction[]): Promise<void> {
    if (eligible.length === 0) return
    setIsBulkSaving(true)
    setError(null)

    const rules = eligible.map((t) => ({
      pattern:  t.matchedPattern ?? t.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase(),
      category: t.category,
    }))
    const transactionIds = eligible.map((t) => t.id)

    try {
      await Promise.all([
        bulkConfirmTransactions(rules, businessType),
        bulkMarkTransactionsReviewed(transactionIds, selectedClient?.id ?? undefined),
      ])

      const patternSet = new Set(rules.map((r) => r.pattern))
      setTransactions((prev) =>
        prev.map((t) => {
          const pattern = t.matchedPattern ?? t.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase()
          if (!patternSet.has(pattern)) return t
          return { ...t, status: 'approved' as const, reviewReason: undefined }
        }),
      )
      setMerchantMemory((m) => {
        const next = new Map(m)
        rules.forEach((r) => next.set(r.pattern, { category: r.category, pattern: r.pattern }))
        return next
      })
    } catch (err) {
      setError(`Bulk save failed — ${(err as Error).message}`)
    } finally {
      setIsBulkSaving(false)
    }
  }

  // TODO: implement recategorisation UI
  function handleRecategorise(): void {}

  return {
    isBulkSaving,
    handleDownload,
    handleApprove,
    handleBulkApprove,
    handleRecategorise,
  }
}
