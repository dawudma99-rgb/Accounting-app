'use server'

import { categoriseTransaction, confirmRule } from '@/services/categorisation/engine'
import { extractReceiptsFromImages } from '@/services/ocr/receipt'
import type { OcrParseResult } from '@/services/ocr/receipt'
import { supabaseServer } from '@/lib/supabase/server'
import type {
  BusinessType,
  CategorizationResult,
  Transaction,
  TransactionCategory,
} from '@/types/transaction'

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
 * Run an array of parsed bank transactions through the categorisation engine.
 * Called from the dashboard after a CSV is uploaded and parsed client-side.
 *
 * Processes sequentially to respect Claude API rate limits.
 * Per-transaction errors are caught and returned as low-confidence "other"
 * rows rather than failing the whole batch.
 */
export async function processTransactions(
  transactions: Transaction[],
  businessType: BusinessType,
): Promise<ProcessedRow[]> {
  const results: ProcessedRow[] = []

  for (const tx of transactions) {
    let result: CategorizationResult

    try {
      result = await categoriseTransaction(tx, { businessType })
    } catch (err) {
      console.error('[processTransactions] Failed on transaction:', tx.description, err)
      result = {
        category: 'other',
        confidence: 0,
        source: 'ai',
        reasoning: 'Categorisation failed — please review manually.',
      }
    }

    results.push({
      description: tx.description,
      merchant:    tx.merchant,
      amount:      tx.amount,
      date:        tx.date,
      category:    result.category,
      confidence:  result.confidence,
      source:      result.source,
      reasoning:   result.reasoning ?? '',
      matchedPattern: result.matchedPattern,
    })
  }

  return results
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
