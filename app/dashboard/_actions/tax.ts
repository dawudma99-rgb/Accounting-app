'use server'

import {
  buildTaxSummary,
  getSavedTaxInputsForClient,
  saveTaxFiguresForClient,
  syncTaxSummaryFlags,
} from '@/server/tax'
import { DEFAULT_TAX_YEAR } from '@/config/taxYears'
import type { TaxSummary } from '@/types/tax'
import type { SavedTaxInputs } from './types'

export async function getSavedTaxInputs(
  clientId: string,
  taxYear: string,
): Promise<SavedTaxInputs | null> {
  return getSavedTaxInputsForClient(clientId, taxYear)
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
  return saveTaxFiguresForClient(clientId, taxYear, inputs, figures)
}

export async function syncSummaryFlags(
  clientId: string,
  taxYear: string,
  summary: TaxSummary,
): Promise<void> {
  return syncTaxSummaryFlags(clientId, taxYear, summary)
}

export async function getTaxSummary(
  clientId: string,
  taxYear: string = DEFAULT_TAX_YEAR,
  businessMiles?: number,
  otherIncome?: number,
): Promise<TaxSummary> {
  return buildTaxSummary(clientId, taxYear, businessMiles, otherIncome)
}
