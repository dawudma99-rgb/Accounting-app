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

/** A bank transaction as fetched from the feed or parsed from a CSV */
export interface Transaction {
  /** Full description text as it appears on the bank statement */
  description: string
  /** Amount in GBP. Positive = money in (income), negative = money out (expense) */
  amount: number
  /** ISO 8601 date string, e.g. "2025-03-15" */
  date: string
  /**
   * Clean display name for the merchant, if known.
   * Optional — derived from description when not provided.
   */
  merchant?: string
}

/** Per-user business context passed alongside each transaction */
export interface ClientContext {
  businessType: BusinessType
  /**
   * Full OCR output from a receipt matched to this transaction.
   * When present, Claude uses it to improve categorisation accuracy.
   */
  receiptText?: string
}

/**
 * A saved categorisation rule stored in Supabase.
 *
 * Supabase table schema (v2):
 *
 *   category_rules (
 *     id            uuid primary key default gen_random_uuid(),
 *     pattern       text not null,           -- case-insensitive regex matched against description
 *     business_type text not null,
 *     category      text not null,
 *     confidence    integer not null,
 *     amount_min    numeric,                 -- inclusive lower bound on |amount|, null = no limit
 *     amount_max    numeric,                 -- inclusive upper bound on |amount|, null = no limit
 *     created_at    timestamptz default now(),
 *     unique (pattern, business_type)
 *   )
 *
 * Migration from v1 (merchant column) to v2 (pattern column):
 *
 *   ALTER TABLE category_rules RENAME COLUMN merchant TO pattern;
 *   ALTER TABLE category_rules ADD COLUMN amount_min numeric;
 *   ALTER TABLE category_rules ADD COLUMN amount_max numeric;
 *   ALTER TABLE category_rules
 *     DROP CONSTRAINT category_rules_merchant_business_type_key;
 *   ALTER TABLE category_rules
 *     ADD CONSTRAINT category_rules_pattern_business_type_key
 *     UNIQUE (pattern, business_type);
 */
export interface CategoryRule {
  id: string
  /** Case-insensitive regex matched against the transaction description */
  pattern: string
  category: TransactionCategory
  confidence: number
  /** Inclusive lower bound on |amount| in GBP; absent = no lower limit */
  amountMin?: number
  /** Inclusive upper bound on |amount| in GBP; absent = no upper limit */
  amountMax?: number
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
  /**
   * The regex pattern that matched (source === 'rules') or was generated
   * by Claude (source === 'ai'). Pass back to confirmRule() when the user
   * approves the transaction to persist it at 99% confidence.
   */
  matchedPattern?: string
  /**
   * Claude's 1–2 sentence explanation. Only present when source === 'ai'.
   * Rules cache hits do not re-run Claude so no reasoning is available.
   */
  reasoning?: string
}
