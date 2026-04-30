import { DEFAULT_TAX_YEAR, getTaxYearConfig } from '@/config/taxYears'
import { supabaseServer } from '@/lib/supabase/server'
import { syncTransactionFlags } from '@/services/flags'
import type { SavedTransaction, TransactionToSave } from '@/types/dashboard'
import type { TransactionCategory } from '@/types/transaction'

export async function saveRunTransactionsForClient(
  clientId: string,
  transactions: TransactionToSave[],
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  if (transactions.length === 0) return

  const { error } = await supabaseServer
    .from('transactions')
    .upsert(
      transactions.map((t) => ({
        id:               t.id,
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
      { onConflict: 'id', ignoreDuplicates: true },
    )

  if (error) throw new Error(error.message)

  const count = await countFlaggedTransactions(clientId, taxYear)
  await syncTransactionFlags(clientId, taxYear, count).catch(console.warn)
}

export async function markTransactionAsReviewed(
  transactionId: string,
  category: TransactionCategory,
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  const { error } = await supabaseServer
    .from('transactions')
    .update({
      category,
      status:        'reviewed',
      review_reason: null,
    })
    .eq('id', transactionId)

  if (error) throw new Error(error.message)

  if (clientId) {
    const count = await countFlaggedTransactions(clientId, taxYear)
    await syncTransactionFlags(clientId, taxYear, count).catch(console.warn)
  }
}

export async function bulkMarkTransactionsAsReviewed(
  transactionIds: string[],
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  if (transactionIds.length === 0) return

  const { error } = await supabaseServer
    .from('transactions')
    .update({
      status:        'reviewed',
      review_reason: null,
    })
    .in('id', transactionIds)

  if (error) throw new Error(error.message)

  if (clientId) {
    const count = await countFlaggedTransactions(clientId, taxYear)
    await syncTransactionFlags(clientId, taxYear, count).catch(console.warn)
  }
}

export async function listClientTransactions(
  clientId: string,
  startDate?: string,
  endDate?: string,
): Promise<SavedTransaction[]> {
  let query = supabaseServer
    .from('transactions')
    .select('id, date, amount, merchant, description, category, confidence_score, status, reasoning, source, match_source, matched_pattern, review_reason, created_at')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  if (startDate) query = query.gte('date', startDate)
  if (endDate)   query = query.lte('date', endDate)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as SavedTransaction[]
}

async function countFlaggedTransactions(clientId: string, taxYear: string): Promise<number> {
  const tyConfig = getTaxYearConfig(taxYear)
  const { count } = await supabaseServer
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'flagged')
    .gte('date', tyConfig.startDate)
    .lte('date', tyConfig.endDate)

  return count ?? 0
}
