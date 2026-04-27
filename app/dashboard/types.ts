import type { TransactionCategory } from '@/types/transaction'
import type { UberWeeklyRow } from '@/services/platformFeed/uber'
import type { ExtractedReceipt } from '@/services/ocr/receipt'

export type View = 'dashboard' | 'clients' | 'client-detail' | 'tax'

export type MatchSource = 'receipt' | 'receipt-uncertain' | 'platform' | 'unmatched'

export type ReturnStatus =
  | 'collecting'
  | 'ready_for_review'
  | 'under_review'
  | 'approved'
  | 'submitted'

export interface ReturnEvaluation {
  clientId:               string
  taxYear:                string
  currentStatus:          ReturnStatus
  canAdvanceTo:           ReturnStatus | null
  blockers:               Array<{ code: string; message: string }>
  warnings:               Array<{ code: string; message: string }>
  isReadyForSubmission:   boolean
}

export interface DashboardTransaction {
  id: string
  date: string
  /** Full bank-statement description text */
  description: string
  /** Clean display name shown in the UI */
  merchant: string
  amount: number
  category: TransactionCategory
  confidence: number
  /** 'hardcoded' = built-in rule, 'memory' = user-confirmed in a prior run */
  source: 'ai' | 'rules' | 'hardcoded' | 'memory'
  reasoning: string
  matchSource: MatchSource
  reviewReason?: string
  status: 'approved' | 'flagged' | 'pending'
  /** Regex pattern from the engine — passed back to confirmRule on approve */
  matchedPattern?: string
  /** The platform payout row this transaction was matched to. */
  matchedRow?: UberWeeklyRow
  /** The extracted receipt this transaction was matched to. */
  matchedReceipt?: ExtractedReceipt
}

/** Merchant memory: pattern (regex) → { category, pattern } */
export type MerchantMemory = Map<string, { category: TransactionCategory; pattern: string }>
