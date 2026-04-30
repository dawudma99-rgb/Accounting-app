import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BusinessType } from '@/types/transaction'
import type { UnmatchedPayout } from '@/services/matching/platform'
import type { UnmatchedReceipt } from '@/services/matching/receipt'
import { loadConfirmedRules, saveRunTransactions } from '../actions'
import type { ClientRecord } from '../actions'
import type { DashboardTransaction, MerchantMemory } from '../types'
import { applyMemory } from '../helpers'
import {
  parseBankFiles,
  parsePlatformFiles,
  streamCategorisation,
  buildPlatformMatchMap,
  processReceiptFiles,
  mergeResults,
} from '../lib/pipeline'

export function useRunPipeline(
  selectedClient: ClientRecord | null,
  taxYear: string,
  businessType: BusinessType,
  merchantMemory: MerchantMemory,
  setTransactions: Dispatch<SetStateAction<DashboardTransaction[]>>,
  setMerchantMemory: Dispatch<SetStateAction<MerchantMemory>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [isProcessing,       setIsProcessing]       = useState(false)
  const [processingProgress, setProcessingProgress] = useState<{ done: number; total: number } | null>(null)
  const [parseWarnings,      setParseWarnings]      = useState<string[]>([])
  const [unmatchedPayouts,   setUnmatchedPayouts]   = useState<UnmatchedPayout[]>([])
  const [unmatchedReceipts,  setUnmatchedReceipts]  = useState<UnmatchedReceipt[]>([])

  useEffect(() => {
    setTransactions([])
    setError(null)
    setParseWarnings([])
    setUnmatchedPayouts([])
    setUnmatchedReceipts([])

    if (!selectedClient) { setMerchantMemory(new Map()); return }

    loadConfirmedRules(selectedClient.business_type).then((rules) => {
      setMerchantMemory(
        rules.length === 0
          ? new Map()
          : new Map(rules.map((r) => [r.pattern, { category: r.category, pattern: r.pattern }])),
      )
    })
  }, [selectedClient?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleProcess(
    bankFiles: File[],
    platformFiles: File[],
    receiptFiles: File[],
  ): Promise<void> {
    if (bankFiles.length === 0) return
    if (!selectedClient) {
      setError('Please select a client before running')
      return
    }

    setIsProcessing(true)
    setError(null)
    setParseWarnings([])
    setUnmatchedPayouts([])
    setUnmatchedReceipts([])

    try {
      // 1 & 2. Parse all files first — fail fast before any AI tokens are spent
      const bank     = await parseBankFiles(bankFiles)
      const platform = await parsePlatformFiles(platformFiles)
      const allWarnings = [...bank.warnings, ...platform.warnings]
      if (allWarnings.length > 0) setParseWarnings(allWarnings)

      // 3. Categorise
      const rows = await streamCategorisation(
        bank.transactions,
        businessType,
        (done, total) => setProcessingProgress({ done, total }),
      )

      // 4. Platform matching
      const { matchMap, unmatchedPayouts } = buildPlatformMatchMap(platform.rows, bank.transactions)

      // 5. Receipt OCR + matching
      const {
        receiptMap,
        unmatchedReceipts,
        warnings: receiptWarnings,
      } = await processReceiptFiles(receiptFiles, bank.transactions)
      if (receiptWarnings.length > 0) setParseWarnings((w) => [...w, ...receiptWarnings])

      // 6. Merge and apply memory
      const displayed = applyMemory(await mergeResults(selectedClient.id, rows, matchMap, receiptMap), merchantMemory)
      setTransactions(displayed)
      setUnmatchedPayouts(unmatchedPayouts)
      setUnmatchedReceipts(unmatchedReceipts)

      // 7. Persist
      try {
        await saveRunTransactions(
          selectedClient.id,
          displayed.map((t) => ({
            id:             t.id,
            date:           t.date,
            amount:         t.amount,
            merchant:       t.merchant || null,
            description:    t.description,
            category:       t.category,
            confidence:     t.confidence,
            reasoning:      t.reasoning,
            source:         t.source,
            matchSource:    t.matchSource,
            matchedPattern: t.matchedPattern ?? null,
            reviewReason:   t.reviewReason ?? null,
          })),
          taxYear,
        )
      } catch (saveErr) {
        setError(`Categorisation complete but results could not be saved: ${(saveErr as Error).message}`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
      setProcessingProgress(null)
    }
  }

  return {
    isProcessing,
    processingProgress,
    parseWarnings,
    unmatchedPayouts,
    unmatchedReceipts,
    handleProcess,
  }
}
