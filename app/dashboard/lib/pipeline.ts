import type { Transaction, BusinessType } from '@/types/transaction'
import { parseMonzoCSV } from '@/services/bankFeed'
import { parseUberCSV } from '@/services/platformFeed/uber'
import type { UberWeeklyRow } from '@/services/platformFeed/uber'
import { matchPlatformPayouts } from '@/services/matching/platform'
import type { UnmatchedPayout } from '@/services/matching/platform'
import { matchReceiptTransactions } from '@/services/matching/receipt'
import type { UnmatchedReceipt } from '@/services/matching/receipt'
import type { ExtractedReceipt } from '@/services/ocr/receipt'
import { ocrReceipts } from '../actions'
import type { ProcessedRow } from '../actions'
import type { DashboardTransaction, MatchSource } from '../types'

// ─── Shared map types ─────────────────────────────────────────────────────────

export type PlatformMatchInfo = {
  matchSource: 'platform' | 'unmatched'
  matchedRow?: UberWeeklyRow
}

export type ReceiptMatchInfo = {
  matchedReceipt: ExtractedReceipt
  matchSource: 'receipt' | 'receipt-uncertain'
}

// ─── Stage 1 & 2: Parsing ────────────────────────────────────────────────────

export async function parseBankFiles(
  files: File[],
): Promise<{ transactions: Transaction[]; warnings: string[] }> {
  const transactions: Transaction[] = []
  const warnings: string[] = []
  for (const file of files) {
    const text = await file.text()
    const result = parseMonzoCSV(text)
    transactions.push(...result.transactions)
    warnings.push(...result.warnings)
  }
  return { transactions, warnings }
}

export async function parsePlatformFiles(
  files: File[],
): Promise<{ rows: UberWeeklyRow[]; warnings: string[] }> {
  const rows: UberWeeklyRow[] = []
  const warnings: string[] = []
  for (const file of files) {
    const text = await file.text()
    const { rows: uberRows, warnings: uberWarnings } = parseUberCSV(text)
    rows.push(...uberRows)
    warnings.push(...uberWarnings)
  }
  return { rows, warnings }
}

// ─── Stage 3: Categorisation (streaming) ─────────────────────────────────────

export async function streamCategorisation(
  transactions: Transaction[],
  businessType: BusinessType,
  onProgress: (done: number, total: number) => void,
): Promise<ProcessedRow[]> {
  const BATCH_SIZE = 100
  const rows: ProcessedRow[] = []
  onProgress(0, transactions.length)

  for (let batchStart = 0; batchStart < transactions.length; batchStart += BATCH_SIZE) {
    const batch = transactions.slice(batchStart, batchStart + BATCH_SIZE)

    const response = await fetch('/api/categorise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: batch, businessType }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Categorisation request failed (${response.status})`)
    }

    const reader  = response.body.getReader()
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
        const row = JSON.parse(line) as ProcessedRow & { __error?: string }
        if (row.__error) throw new Error(row.__error)
        rows.push(row)
        onProgress(rows.length, transactions.length)
      }
    }
  }

  return rows
}

// ─── Stage 4: Platform matching ───────────────────────────────────────────────

export function buildPlatformMatchMap(
  uberRows: UberWeeklyRow[],
  transactions: Transaction[],
): { matchMap: Map<number, PlatformMatchInfo>; unmatchedPayouts: UnmatchedPayout[] } {
  if (uberRows.length === 0) return { matchMap: new Map(), unmatchedPayouts: [] }

  const { transactions: annotated, unmatchedPayouts } = matchPlatformPayouts(uberRows, transactions)
  const matchMap = new Map<number, PlatformMatchInfo>()
  annotated.forEach((a, i) =>
    matchMap.set(i, { matchSource: a.matchSource, matchedRow: a.matchedRow }),
  )
  return { matchMap, unmatchedPayouts }
}

// ─── Stage 5: Receipt OCR + matching ─────────────────────────────────────────

const MAX_FILE_SIZE   = 10 * 1024 * 1024
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const OCR_CONCURRENCY = 3

async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes  = new Uint8Array(buffer)
  const CHUNK  = 8192
  let result   = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(result)
}

export async function processReceiptFiles(
  files: File[],
  transactions: Transaction[],
): Promise<{
  receiptMap: Map<number, ReceiptMatchInfo>
  unmatchedReceipts: UnmatchedReceipt[]
  warnings: string[]
}> {
  const warnings: string[] = []
  const validFiles: File[] = []

  for (const file of files) {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      warnings.push(`Receipt "${file.name}" skipped — unsupported type ${file.type}`)
    } else if (file.size > MAX_FILE_SIZE) {
      warnings.push(`Receipt "${file.name}" skipped — file too large (max 10 MB)`)
    } else {
      validFiles.push(file)
    }
  }

  if (validFiles.length === 0) return { receiptMap: new Map(), unmatchedReceipts: [], warnings }

  const encoded = await Promise.all(
    validFiles.map(async (file) => ({
      base64:    await toBase64(file),
      mediaType: file.type,
      fileName:  file.name,
    })),
  )

  const allExtracted: ExtractedReceipt[] = []
  for (let i = 0; i < encoded.length; i += OCR_CONCURRENCY) {
    const batch = encoded.slice(i, i + OCR_CONCURRENCY)
    const { receipts: extracted, failed } = await ocrReceipts(batch)
    allExtracted.push(...extracted)
    for (const f of failed) warnings.push(`Receipt "${f.fileName}" skipped — ${f.reason}`)
  }

  if (allExtracted.length === 0) return { receiptMap: new Map(), unmatchedReceipts: [], warnings }

  const { transactions: receiptAnnotated, unmatchedReceipts } =
    matchReceiptTransactions(allExtracted, transactions)

  const receiptMap = new Map<number, ReceiptMatchInfo>()
  receiptAnnotated.forEach((a, i) => {
    if ((a.matchSource === 'receipt' || a.matchSource === 'receipt-uncertain') && a.matchedReceipt) {
      receiptMap.set(i, { matchedReceipt: a.matchedReceipt, matchSource: a.matchSource })
    }
  })

  return { receiptMap, unmatchedReceipts, warnings }
}

// ─── Stage 6: Merge ───────────────────────────────────────────────────────────

async function deterministicId(
  clientId: string,
  date: string,
  amount: number,
  description: string,
): Promise<string> {
  const input   = `${clientId}|${date}|${amount}|${description}`
  const encoded = new TextEncoder().encode(input)
  const buffer  = await crypto.subtle.digest('SHA-256', encoded)
  const hex     = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export async function mergeResults(
  clientId: string,
  rows: ProcessedRow[],
  matchMap: Map<number, PlatformMatchInfo>,
  receiptMap: Map<number, ReceiptMatchInfo>,
): Promise<DashboardTransaction[]> {
  return Promise.all(rows.map(async (r, i) => {
    const platformMatch = matchMap.get(i)
    const receiptMatch  = receiptMap.get(i)
    const matchSource: MatchSource = platformMatch?.matchSource === 'platform'
      ? 'platform'
      : receiptMatch
      ? receiptMatch.matchSource
      : 'unmatched'
    return {
      id:             await deterministicId(clientId, r.date, r.amount, r.description),
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
  }))
}
