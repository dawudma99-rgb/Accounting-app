'use server'

import { confirmRule } from '@/services/categorisation/engine'
import type { BusinessType, TransactionCategory } from '@/types/transaction'

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
