'use server'

import {
  advanceClientReturn,
  evaluateClientReturn,
} from '@/server/returns'
import type { ReturnEvaluation, ReturnStatus } from '@/services/returns/evaluate'

export async function getReturnEvaluation(
  clientId: string,
  taxYear: string,
): Promise<ReturnEvaluation> {
  return evaluateClientReturn(clientId, taxYear)
}

export async function advanceReturn(
  clientId: string,
  taxYear: string,
  to: ReturnStatus,
): Promise<ReturnEvaluation> {
  return advanceClientReturn(clientId, taxYear, to)
}
