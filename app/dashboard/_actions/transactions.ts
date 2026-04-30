'use server'

import {
  bulkMarkTransactionsAsReviewed,
  listClientTransactions,
  markTransactionAsReviewed,
  saveRunTransactionsForClient,
} from '@/server/transactions'
import { DEFAULT_TAX_YEAR } from '@/config/taxYears'
import type { TransactionCategory } from '@/types/transaction'
import type { SavedTransaction, TransactionToSave } from './types'

export async function saveRunTransactions(
  clientId: string,
  transactions: TransactionToSave[],
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  return saveRunTransactionsForClient(clientId, transactions, taxYear)
}

export async function markTransactionReviewed(
  transactionId: string,
  category: TransactionCategory,
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  return markTransactionAsReviewed(transactionId, category, clientId, taxYear)
}

export async function bulkMarkTransactionsReviewed(
  transactionIds: string[],
  clientId?: string,
  taxYear: string = DEFAULT_TAX_YEAR,
): Promise<void> {
  return bulkMarkTransactionsAsReviewed(transactionIds, clientId, taxYear)
}

export async function getClientTransactions(
  clientId: string,
  startDate?: string,
  endDate?: string,
): Promise<SavedTransaction[]> {
  return listClientTransactions(clientId, startDate, endDate)
}
