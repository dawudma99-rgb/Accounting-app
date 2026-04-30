import type { ReturnStatus } from '@/services/returns/evaluate'
import type { BusinessType, TransactionCategory } from '@/types/transaction'

export interface ClientRecord {
  id: string
  name: string
  business_type: BusinessType
  utr: string | null
  created_at: string
}

export interface TransactionToSave {
  id: string
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

export interface SavedTaxYearSummary {
  id: string
  tax_year: string
  gross_income: number | null
  total_expenses: number | null
  net_profit: number | null
  total_liability: number | null
  return_status: ReturnStatus
  figures_saved_at: string | null
}

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

export interface ClientFlag {
  id: string
  client_id: string
  tax_year: string | null
  flag_type: string
  description: string
  status: string
  raised_at: string
  resolved_at: string | null
  override_reason: string | null
}

export interface SavedTaxInputs {
  businessMiles: number | null
  otherIncome: number | null
  taxPaidAtSource: number
  studentLoanPlan: string | null
  declarationConfirmed: boolean
  figuresSavedAt: string | null
}

export interface ClientDocument {
  id: string
  client_id: string
  tax_year: string
  category: string
  file_url: string
  file_name: string
  file_type: string
  expense_amount: number | null
  needs_review: boolean
  accountant_reviewed: boolean
  uploaded_by: string
  upload_date: string
}
