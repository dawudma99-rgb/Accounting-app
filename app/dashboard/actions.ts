'use server'

import { confirmRule } from '@/services/categorisation/engine'
import { extractReceiptsFromImages } from '@/services/ocr/receipt'
import type { OcrParseResult } from '@/services/ocr/receipt'
import { supabaseServer } from '@/lib/supabase/server'
import type {
  BusinessType,
  TransactionCategory,
} from '@/types/transaction'
import { calculateTaxSummary } from '@/services/tax/calculator'
import { getTaxYearConfig, DEFAULT_TAX_YEAR } from '@/config/taxYears'
import type { TaxSummary } from '@/types/tax'

// ─── Client types ─────────────────────────────────────────────────────────────

export interface ClientRecord {
  id: string
  name: string
  business_type: BusinessType
  utr: string | null
  created_at: string
}

export interface TransactionToSave {
  date: string
  amount: number
  merchant: string | null
  description: string
  category: TransactionCategory
  confidence: number
  reasoning: string
  source: 'ai' | 'rules' | 'hardcoded' | 'memory'
  matchSource: 'receipt' | 'receipt-uncertain' | 'platform' | 'unmatched'
  matchedPattern?: string | null
  reviewReason?: string | null
}

export interface SavedTransaction {
  id: string
  date: string
  amount: number
  merchant: string | null
  description: string | null
  category: string
  confidence_score: number
  status: string
  reasoning: string | null
  source: string | null
  match_source: string | null
  matched_pattern: string | null
  review_reason: string | null
  created_at: string
}

// ─── Process a batch of transactions ─────────────────────────────────────────

export interface ProcessedRow {
  description: string
  merchant?: string
  amount: number
  date: string
  category: TransactionCategory
  confidence: number
  source: 'rules' | 'ai'
  reasoning: string
  matchedPattern?: string
}


/**
 * Persist a user-confirmed merchant categorisation at 99% confidence.
 * Called when the user clicks "Approve & remember" in the dashboard.
 */
export async function confirmTransaction(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  await confirmRule(pattern, businessType, category)
}

/**
 * Run Claude Vision OCR on a batch of receipt images.
 * Called from the dashboard after the user uploads receipt files.
 *
 * Files are passed as base64 strings since File objects cannot be serialised
 * through server actions directly.
 */
export async function ocrReceipts(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  return extractReceiptsFromImages(files)
}

/**
 * Save multiple rules to the rulebook in a single Supabase upsert.
 * Called by the bulk approve bar when the accountant approves a filtered set.
 */
export async function bulkConfirmTransactions(
  rules: Array<{ pattern: string; category: TransactionCategory }>,
  businessType: BusinessType,
): Promise<void> {
  if (rules.length === 0) return

  const { error } = await supabaseServer
    .from('category_rules')
    .upsert(
      rules.map((r) => ({
        pattern:       r.pattern,
        business_type: businessType,
        category:      r.category,
        confidence:    99,
      })),
      { onConflict: 'pattern,business_type' },
    )

  if (error) throw new Error(error.message)
}

// ─── Client CRUD ──────────────────────────────────────────────────────────────

/**
 * Fetch all clients ordered by creation date descending.
 */
export async function getClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabaseServer
    .from('clients')
    .select('id, name, business_type, utr, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientRecord[]
}

/**
 * Create a new client and return the inserted row.
 */
export async function createClient(input: {
  name: string
  businessType: BusinessType
  utr?: string | null
}): Promise<ClientRecord> {
  const { data, error } = await supabaseServer
    .from('clients')
    .insert({
      name:          input.name,
      business_type: input.businessType,
      utr:           input.utr ?? null,
    })
    .select('id, name, business_type, utr, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data as ClientRecord
}

/**
 * Bulk-insert categorised transactions from a run under a given client.
 * Each row maps to the transactions table schema.
 */
export async function saveRunTransactions(
  clientId: string,
  transactions: TransactionToSave[],
): Promise<void> {
  if (transactions.length === 0) return

  const { error } = await supabaseServer
    .from('transactions')
    .insert(
      transactions.map((t) => ({
        client_id:        clientId,
        date:             t.date,
        amount:           t.amount,
        merchant:         t.merchant,
        description:      t.description,
        category:         t.category,
        confidence_score: t.confidence,
        status:           t.confidence >= 80 ? 'auto_approved' : 'flagged',
        reasoning:        t.reasoning,
        source:           t.source,
        match_source:     t.matchSource,
        matched_pattern:  t.matchedPattern ?? null,
        review_reason:    t.reviewReason ?? null,
      })),
    )

  if (error) throw new Error(error.message)
}

/**
 * Fetch all saved transactions for a client, newest first.
 */
export async function getClientTransactions(clientId: string): Promise<SavedTransaction[]> {
  const { data, error } = await supabaseServer
    .from('transactions')
    .select('id, date, amount, merchant, description, category, confidence_score, status, reasoning, source, match_source, matched_pattern, review_reason, created_at')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as SavedTransaction[]
}

// ─── Rules ────────────────────────────────────────────────────────────────────

/**
 * Load all user-confirmed rules (confidence >= 99) for a given business type.
 * Called on dashboard mount to restore merchant memory across page refreshes.
 */
export async function loadConfirmedRules(
  businessType: BusinessType,
): Promise<Array<{ pattern: string; category: TransactionCategory }>> {
  const { data, error } = await supabaseServer
    .from('category_rules')
    .select('pattern, category')
    .eq('business_type', businessType)
    .gte('confidence', 99)

  if (error) {
    console.warn('[loadConfirmedRules] Supabase lookup failed:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    pattern:  r.pattern,
    category: r.category as TransactionCategory,
  }))
}

// ─── Tax Summary ──────────────────────────────────────────────────────────────

/**
 * Fetch all transactions saved for a client, filter to the given tax year's
 * date range, split into approved vs flagged, then run the pure calculator.
 *
 * Only 'auto_approved' and 'reviewed' transactions contribute to the figures.
 * Flagged transactions are counted and surfaced in the result so the UI can
 * warn the accountant that the totals may be incomplete.
 */
export async function getTaxSummary(
  clientId: string,
  taxYear:      string = DEFAULT_TAX_YEAR,
  businessMiles?: number,
  otherIncome?:   number,
): Promise<TaxSummary> {
  const config = getTaxYearConfig(taxYear)

  const { data, error } = await supabaseServer
    .from('transactions')
    .select('date, amount, category, status')
    .eq('client_id', clientId)

  if (error) throw new Error(error.message)

  const all = data ?? []

  // Filter to the tax year's 6 Apr – 5 Apr window
  const inYear = all.filter(
    (t) => t.date >= config.startDate && t.date <= config.endDate,
  )

  const outOfRange = all.filter(
    (t) => t.date < config.startDate || t.date > config.endDate,
  )

  const approved = inYear.filter(
    (t) => t.status === 'auto_approved' || t.status === 'reviewed',
  )
  const flagged  = inYear.filter((t) => t.status === 'flagged')

  return calculateTaxSummary(
    approved.map((t) => ({
      amount:   Number(t.amount),
      category: t.category as TransactionCategory,
      date:     t.date,
    })),
    config,
    {
      businessMiles,
      otherIncome,
      flaggedTransactionCount:    flagged.length,
      outOfRangeTransactionCount: outOfRange.length,
    },
  )
}
