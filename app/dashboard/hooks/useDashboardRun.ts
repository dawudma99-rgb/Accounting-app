import { useState } from 'react'
import type { BusinessType } from '@/types/transaction'
import type { UnmatchedPayout } from '@/services/matching/platform'
import type { UnmatchedReceipt } from '@/services/matching/receipt'
import type { ClientRecord } from '../actions'
import type { DashboardTransaction, MerchantMemory } from '../types'
import { useRunPipeline } from './useRunPipeline'
import { useTransactionActions } from './useTransactionActions'

export interface DashboardRunState {
  transactions:        DashboardTransaction[]
  isProcessing:        boolean
  processingProgress:  { done: number; total: number } | null
  merchantMemory:      MerchantMemory
  error:               string | null
  parseWarnings:       string[]
  unmatchedPayouts:    UnmatchedPayout[]
  unmatchedReceipts:   UnmatchedReceipt[]
  isBulkSaving:        boolean
  businessType:        BusinessType
}

export interface DashboardRunActions {
  handleProcess:      (bankFiles: File[], platformFiles: File[], receiptFiles: File[]) => Promise<void>
  handleDownload:     () => void
  handleApprove:      (id: string) => Promise<void>
  handleBulkApprove:  (eligible: DashboardTransaction[]) => Promise<void>
  handleRecategorise: (id: string) => void
}

export function useDashboardRun(
  selectedClient: ClientRecord | null,
  taxYear: string,
): DashboardRunState & DashboardRunActions {
  const [transactions,   setTransactions]   = useState<DashboardTransaction[]>([])
  const [merchantMemory, setMerchantMemory] = useState<MerchantMemory>(new Map())
  const [error,          setError]          = useState<string | null>(null)

  const businessType: BusinessType = selectedClient?.business_type ?? 'taxi'

  const pipeline = useRunPipeline(
    selectedClient,
    taxYear,
    businessType,
    merchantMemory,
    setTransactions,
    setMerchantMemory,
    setError,
  )

  const actions = useTransactionActions(
    transactions,
    setTransactions,
    merchantMemory,
    setMerchantMemory,
    pipeline.unmatchedPayouts,
    businessType,
    selectedClient,
    setError,
  )

  return {
    transactions,
    merchantMemory,
    error,
    businessType,
    ...pipeline,
    ...actions,
  }
}
