'use server'

import {
  bulkConfirmTransactionRules,
  confirmTransactionRule,
  extractReceiptBatch,
  listConfirmedRules,
} from '@/server/categorisation'
import type { OcrParseResult } from '@/services/ocr/receipt'
import type { BusinessType, TransactionCategory } from '@/types/transaction'

export async function confirmTransaction(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  return confirmTransactionRule(pattern, category, businessType)
}

export async function ocrReceipts(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  return extractReceiptBatch(files)
}

export async function bulkConfirmTransactions(
  rules: Array<{ pattern: string; category: TransactionCategory }>,
  businessType: BusinessType,
): Promise<void> {
  return bulkConfirmTransactionRules(rules, businessType)
}

export async function loadConfirmedRules(
  businessType: BusinessType,
): Promise<Array<{ pattern: string; category: TransactionCategory }>> {
  return listConfirmedRules(businessType)
}
