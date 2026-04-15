import { useState, useEffect } from 'react'
import type { Transaction, BusinessType } from '@/types/transaction'
import { parseMonzoCSV } from '@/services/bankFeed'
import { parseUberCSV } from '@/services/platformFeed/uber'
import type { UberWeeklyRow } from '@/services/platformFeed/uber'
import { matchPlatformPayouts } from '@/services/matching/platform'
import type { UnmatchedPayout } from '@/services/matching/platform'
import { matchReceiptTransactions } from '@/services/matching/receipt'
import type { UnmatchedReceipt } from '@/services/matching/receipt'
import type { ExtractedReceipt } from '@/services/ocr/receipt'
import { serialiseToCsv } from '@/lib/export/csv'
import type { ExportRow } from '@/lib/export/csv'
import {
  bulkConfirmTransactions,
  confirmTransaction,
  loadConfirmedRules,
  ocrReceipts,
  saveRunTransactions,
} from '../actions'
import type { ClientRecord, ProcessedRow } from '../actions'
import type { DashboardTransaction, MerchantMemory, MatchSource } from '../types'
import { applyMemory } from '../helpers'

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
): DashboardRunState & DashboardRunActions {
  const [transactions,        setTransactions]        = useState<DashboardTransaction[]>([])
  const [isProcessing,        setIsProcessing]        = useState(false)
  const [processingProgress,  setProcessingProgress]  = useState<{ done: number; total: number } | null>(null)
  const [merchantMemory,      setMerchantMemory]      = useState<MerchantMemory>(new Map())
  const [error,               setError]               = useState<string | null>(null)
  const [parseWarnings,       setParseWarnings]       = useState<string[]>([])
  const [unmatchedPayouts,    setUnmatchedPayouts]    = useState<UnmatchedPayout[]>([])
  const [unmatchedReceipts,   setUnmatchedReceipts]   = useState<UnmatchedReceipt[]>([])
  const [isBulkSaving,        setIsBulkSaving]        = useState(false)

  const businessType: BusinessType = selectedClient?.business_type ?? 'taxi'

  // Reset run state and reload merchant memory whenever the selected client changes.
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
      // 1. Parse ALL files first — fail fast before any AI tokens are spent

      const allWarnings: string[] = []

      const parsed: Transaction[] = []
      for (const file of bankFiles) {
        const text = await file.text()
        const { transactions, warnings } = parseMonzoCSV(text)
        parsed.push(...transactions)
        allWarnings.push(...warnings)
      }

      const allUberRows: UberWeeklyRow[] = []
      for (const file of platformFiles) {
        const text = await file.text()
        const { rows: uberRows, warnings: uberWarnings } = parseUberCSV(text)
        allUberRows.push(...uberRows)
        allWarnings.push(...uberWarnings)
      }

      if (allWarnings.length > 0) setParseWarnings(allWarnings)

      // 2. Categorise — single streaming request; server pushes each result as NDJSON
      setProcessingProgress({ done: 0, total: parsed.length })
      const rows: ProcessedRow[] = []

      const catResponse = await fetch('/api/categorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: parsed, businessType }),
      })

      if (!catResponse.ok || !catResponse.body) {
        throw new Error(`Categorisation request failed (${catResponse.status})`)
      }

      const reader  = catResponse.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const parsed2 = JSON.parse(line) as ProcessedRow & { __error?: string }
          if (parsed2.__error) throw new Error(parsed2.__error)
          rows.push(parsed2)
          setProcessingProgress({ done: rows.length, total: parsed.length })
        }
      }

      // 3. Platform matching — allUberRows already parsed above
      type MatchInfo = { matchSource: 'platform' | 'unmatched'; matchedRow?: UberWeeklyRow }
      const matchMap = new Map<number, MatchInfo>()
      let newUnmatched: UnmatchedPayout[] = []

      if (allUberRows.length > 0) {
        const { transactions: annotated, unmatchedPayouts: unmatched } =
          matchPlatformPayouts(allUberRows, parsed)
        newUnmatched = unmatched
        annotated.forEach((a, i) =>
          matchMap.set(i, { matchSource: a.matchSource, matchedRow: a.matchedRow }),
        )
      }

      // 4. Receipt OCR + matching (if receipts uploaded)
      const receiptMap = new Map<number, { matchedReceipt: ExtractedReceipt; matchSource: 'receipt' | 'receipt-uncertain' }>()
      let newUnmatchedReceipts: UnmatchedReceipt[] = []

      if (receiptFiles.length > 0) {
        const MAX_FILE_SIZE   = 10 * 1024 * 1024
        const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        const CONCURRENCY     = 3

        const validFiles: File[]           = []
        const validationWarnings: string[] = []
        for (const file of receiptFiles) {
          if (!SUPPORTED_TYPES.includes(file.type)) {
            validationWarnings.push(`Receipt "${file.name}" skipped — unsupported type ${file.type}`)
          } else if (file.size > MAX_FILE_SIZE) {
            validationWarnings.push(`Receipt "${file.name}" skipped — file too large (max 10 MB)`)
          } else {
            validFiles.push(file)
          }
        }
        if (validationWarnings.length > 0) setParseWarnings((w) => [...w, ...validationWarnings])

        const toBase64 = async (file: File): Promise<string> => {
          const buffer = await file.arrayBuffer()
          const bytes  = new Uint8Array(buffer)
          const CHUNK  = 8192
          let result   = ''
          for (let i = 0; i < bytes.length; i += CHUNK) {
            result += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
          }
          return btoa(result)
        }

        const encoded = await Promise.all(
          validFiles.map(async (file) => ({
            base64:    await toBase64(file),
            mediaType: file.type,
            fileName:  file.name,
          })),
        )

        const allExtracted: ExtractedReceipt[] = []
        const allFailed: Array<{ fileName: string; reason: string }> = []
        for (let i = 0; i < encoded.length; i += CONCURRENCY) {
          const batch = encoded.slice(i, i + CONCURRENCY)
          const { receipts: extracted, failed } = await ocrReceipts(batch)
          allExtracted.push(...extracted)
          allFailed.push(...failed)
        }

        if (allFailed.length > 0) {
          setParseWarnings((w) => [
            ...w,
            ...allFailed.map((f) => `Receipt "${f.fileName}" skipped — ${f.reason}`),
          ])
        }
        if (allExtracted.length > 0) {
          const { transactions: receiptAnnotated, unmatchedReceipts: unmatched } =
            matchReceiptTransactions(allExtracted, parsed)
          newUnmatchedReceipts = unmatched
          receiptAnnotated.forEach((a, i) => {
            if ((a.matchSource === 'receipt' || a.matchSource === 'receipt-uncertain') && a.matchedReceipt) {
              receiptMap.set(i, { matchedReceipt: a.matchedReceipt, matchSource: a.matchSource })
            }
          })
        }
      }

      // 5. Merge categorisation + platform + receipt results
      const mapped: DashboardTransaction[] = rows.map((r, i) => {
        const platformMatch = matchMap.get(i)
        const receiptMatch  = receiptMap.get(i)
        const matchSource: MatchSource = platformMatch?.matchSource === 'platform'
          ? 'platform'
          : receiptMatch
          ? receiptMatch.matchSource
          : 'unmatched'
        return {
          id:             String(i),
          date:           r.date,
          description:    r.description,
          merchant:       r.merchant ?? r.description,
          amount:         r.amount,
          category:       r.category,
          confidence:     r.confidence,
          source:         r.source,
          reasoning:      r.reasoning ?? '',
          matchSource,
          matchedRow:     platformMatch?.matchedRow,
          matchedReceipt: receiptMatch?.matchedReceipt,
          status:         r.confidence >= 80 ? 'approved' : 'flagged',
          reviewReason:   r.confidence < 80 ? 'Low confidence — please review' : undefined,
          matchedPattern: r.matchedPattern,
        }
      })

      setTransactions(applyMemory(mapped, merchantMemory))
      setUnmatchedPayouts(newUnmatched)
      setUnmatchedReceipts(newUnmatchedReceipts)

      // 6. Persist to Supabase under the selected client
      try {
        await saveRunTransactions(
          selectedClient.id,
          mapped.map((t) => ({
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
      await confirmTransaction(pattern, tx.category, businessType)
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

    try {
      await bulkConfirmTransactions(rules, businessType)

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
  function handleRecategorise(_id: string): void {
    // placeholder — recategorisation flow not yet implemented
  }

  return {
    transactions,
    isProcessing,
    processingProgress,
    merchantMemory,
    error,
    parseWarnings,
    unmatchedPayouts,
    unmatchedReceipts,
    isBulkSaving,
    businessType,
    handleProcess,
    handleDownload,
    handleApprove,
    handleBulkApprove,
    handleRecategorise,
  }
}
