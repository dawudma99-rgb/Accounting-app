'use server'

import { categoriseTransaction, confirmRule } from '@/services/categorisation/engine'
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
 *
 * @param pattern      The matchedPattern from CategorizationResult, or a regex
 *                     derived from the merchant name as a fallback.
 * @param category     The category the user confirmed.
 * @param businessType The client's trade type.
 */
export async function confirmTransaction(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  await confirmRule(pattern, businessType, category)
}
