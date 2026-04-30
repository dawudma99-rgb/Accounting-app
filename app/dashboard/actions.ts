'use server'

import type { OcrParseResult } from '@/services/ocr/receipt'
import type { ReturnEvaluation, ReturnStatus } from '@/services/returns/evaluate'
import type { TaxSummary } from '@/types/tax'
import type { BusinessType, TransactionCategory } from '@/types/transaction'
import {
  bulkConfirmTransactions as bulkConfirmTransactionsAction,
  confirmTransaction as confirmTransactionAction,
  loadConfirmedRules as loadConfirmedRulesAction,
  ocrReceipts as ocrReceiptsAction,
} from './_actions/categorisation'
import {
  createClient as createClientAction,
  getClient as getClientAction,
  getClients as getClientsAction,
  getClientTaxYears as getClientTaxYearsAction,
} from './_actions/clients'
import {
  getClientDocuments as getClientDocumentsAction,
  getDocumentUrl as getDocumentUrlAction,
  getUploadUrl as getUploadUrlAction,
  markDocumentReviewed as markDocumentReviewedAction,
  saveDocumentRecord as saveDocumentRecordAction,
} from './_actions/documents'
import {
  getClientFlagCounts as getClientFlagCountsAction,
  getClientFlags as getClientFlagsAction,
  resolveFlag as resolveFlagAction,
  runFlagCheck as runFlagCheckAction,
} from './_actions/flags'
import {
  advanceReturn as advanceReturnAction,
  getReturnEvaluation as getReturnEvaluationAction,
} from './_actions/returns'
import {
  getSavedTaxInputs as getSavedTaxInputsAction,
  getTaxSummary as getTaxSummaryAction,
  saveTaxFigures as saveTaxFiguresAction,
  syncSummaryFlags as syncSummaryFlagsAction,
} from './_actions/tax'
import {
  bulkMarkTransactionsReviewed as bulkMarkTransactionsReviewedAction,
  getClientTransactions as getClientTransactionsAction,
  markTransactionReviewed as markTransactionReviewedAction,
  saveRunTransactions as saveRunTransactionsAction,
} from './_actions/transactions'
import type {
  ClientDocument,
  ClientFlag,
  ClientRecord,
  SavedTaxInputs,
  SavedTaxYearSummary,
  SavedTransaction,
  TransactionToSave,
} from './_actions/types'

export type * from './_actions/types'

export async function confirmTransaction(
  pattern: string,
  category: TransactionCategory,
  businessType: BusinessType,
): Promise<void> {
  return confirmTransactionAction(pattern, category, businessType)
}

export async function ocrReceipts(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  return ocrReceiptsAction(files)
}

export async function bulkConfirmTransactions(
  rules: Array<{ pattern: string; category: TransactionCategory }>,
  businessType: BusinessType,
): Promise<void> {
  return bulkConfirmTransactionsAction(rules, businessType)
}

export async function loadConfirmedRules(
  businessType: BusinessType,
): Promise<Array<{ pattern: string; category: TransactionCategory }>> {
  return loadConfirmedRulesAction(businessType)
}

export async function getClients(): Promise<ClientRecord[]> {
  return getClientsAction()
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  return getClientAction(id)
}

export async function createClient(input: {
  name: string
  businessType: BusinessType
  utr?: string | null
}): Promise<ClientRecord> {
  return createClientAction(input)
}

export async function getClientTaxYears(clientId: string): Promise<SavedTaxYearSummary[]> {
  return getClientTaxYearsAction(clientId)
}

export async function getUploadUrl(
  clientId: string,
  taxYear: string,
  fileName: string,
): Promise<{ signedUrl: string; path: string }> {
  return getUploadUrlAction(clientId, taxYear, fileName)
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  return getDocumentUrlAction(storagePath)
}

export async function saveDocumentRecord(
  clientId: string,
  taxYear: string,
  category: string,
  storagePath: string,
  fileName: string,
  fileType: string,
  expenseAmount?: number,
): Promise<ClientDocument> {
  return saveDocumentRecordAction(clientId, taxYear, category, storagePath, fileName, fileType, expenseAmount)
}

export async function getClientDocuments(
  clientId: string,
  taxYear: string,
): Promise<ClientDocument[]> {
  return getClientDocumentsAction(clientId, taxYear)
}

export async function markDocumentReviewed(
  documentId: string,
  clientId: string,
  taxYear: string,
): Promise<void> {
  return markDocumentReviewedAction(documentId, clientId, taxYear)
}

export async function runFlagCheck(clientId: string, taxYear: string): Promise<void> {
  return runFlagCheckAction(clientId, taxYear)
}

export async function getClientFlags(clientId: string): Promise<ClientFlag[]> {
  return getClientFlagsAction(clientId)
}

export async function resolveFlag(
  flagId: string,
  status: 'resolved' | 'overridden',
  overrideReason?: string,
): Promise<void> {
  return resolveFlagAction(flagId, status, overrideReason)
}

export async function getClientFlagCounts(): Promise<Record<string, number>> {
  return getClientFlagCountsAction()
}

export async function getReturnEvaluation(
  clientId: string,
  taxYear: string,
): Promise<ReturnEvaluation> {
  return getReturnEvaluationAction(clientId, taxYear)
}

export async function advanceReturn(
  clientId: string,
  taxYear: string,
  to: ReturnStatus,
): Promise<ReturnEvaluation> {
  return advanceReturnAction(clientId, taxYear, to)
}

export async function getSavedTaxInputs(
  clientId: string,
  taxYear: string,
): Promise<SavedTaxInputs | null> {
  return getSavedTaxInputsAction(clientId, taxYear)
}

export async function saveTaxFigures(
  clientId: string,
  taxYear: string,
  inputs: {
    businessMiles?: number
    otherIncome?: number
    taxPaidAtSource: number
    studentLoanPlan?: string
    declarationConfirmed: boolean
  },
  figures: {
    turnover: number
    totalAllowableExpenses: number
    taxableProfit: number
    totalIncomeTax: number
    niClass2Annual: number
    totalNiClass4: number
    totalStudentLoan: number
    totalLiability: number
    requiresPaymentOnAccount: boolean
    poaPerPayment: number
    balancingPayment: number
    lossesCarriedForward: number
    januaryDate: string
    julyDate: string
  },
): Promise<void> {
  return saveTaxFiguresAction(clientId, taxYear, inputs, figures)
}

export async function syncSummaryFlags(
  clientId: string,
  taxYear: string,
  summary: TaxSummary,
): Promise<void> {
  return syncSummaryFlagsAction(clientId, taxYear, summary)
}

export async function getTaxSummary(
  clientId: string,
  taxYear?: string,
  businessMiles?: number,
  otherIncome?: number,
): Promise<TaxSummary> {
  return getTaxSummaryAction(clientId, taxYear, businessMiles, otherIncome)
}

export async function saveRunTransactions(
  clientId: string,
  transactions: TransactionToSave[],
  taxYear?: string,
): Promise<void> {
  return saveRunTransactionsAction(clientId, transactions, taxYear)
}

export async function markTransactionReviewed(
  transactionId: string,
  category: TransactionCategory,
  clientId?: string,
  taxYear?: string,
): Promise<void> {
  return markTransactionReviewedAction(transactionId, category, clientId, taxYear)
}

export async function bulkMarkTransactionsReviewed(
  transactionIds: string[],
  clientId?: string,
  taxYear?: string,
): Promise<void> {
  return bulkMarkTransactionsReviewedAction(transactionIds, clientId, taxYear)
}

export async function getClientTransactions(
  clientId: string,
  startDate?: string,
  endDate?: string,
): Promise<SavedTransaction[]> {
  return getClientTransactionsAction(clientId, startDate, endDate)
}
