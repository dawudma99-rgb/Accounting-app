import { supabaseServer } from '@/lib/supabase/server'
import { confirmRule } from '@/services/categorisation/engine'
import { extractReceiptsFromImages } from '@/services/ocr/receipt'
import type { OcrParseResult } from '@/services/ocr/receipt'
import type { BusinessType, TransactionCategory } from '@/types/transaction'

export async function confirmTransactionRule(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  await confirmRule(pattern, businessType, category)
}

export async function extractReceiptBatch(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  return extractReceiptsFromImages(files)
}

export async function bulkConfirmTransactionRules(
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

export async function listConfirmedRules(
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
