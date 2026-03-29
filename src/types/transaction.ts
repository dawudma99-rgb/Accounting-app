export const TRANSACTION_CATEGORIES = [
  'fuel',
  'materials',
  'tools',
  'insurance',
  'software',
  'subcontractor',
  'income',
  'other',
] as const

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]

export type BusinessType = 'mechanic' | 'plumber'

/** A bank transaction as fetched from the feed */
export interface Transaction {
  /** Amount in GBP. Positive = money in (income), negative = money out (expense) */
  amount: number
  /** Merchant or counterparty name as it appears on the bank statement */
  merchant: string
  /** ISO 8601 date string, e.g. "2025-03-15" */
  date: string
}

/** Per-user business context passed alongside each transaction */
export interface ClientContext {
  businessType: BusinessType
}

/** A saved categorisation rule stored in Supabase */
export interface CategoryRule {
  id: string
  merchant: string
  category: TransactionCategory
  confidence: number
  businessType: BusinessType
  createdAt: string
}

/** Result returned by the categorisation engine */
export interface CategorizationResult {
  category: TransactionCategory
  /** 0–100 confidence score */
  confidence: number
  /** Whether the result came from the rules cache or a live AI call */
  source: 'rules' | 'ai'
}
