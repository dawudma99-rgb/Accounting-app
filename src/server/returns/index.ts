import {
  advanceReturnStatus,
  evaluateReturn,
} from '@/services/returns/evaluate'
import type { ReturnEvaluation, ReturnStatus } from '@/services/returns/evaluate'

export async function evaluateClientReturn(
  clientId: string,
  taxYear: string,
): Promise<ReturnEvaluation> {
  return evaluateReturn(clientId, taxYear)
}

export async function advanceClientReturn(
  clientId: string,
  taxYear: string,
  to: ReturnStatus,
): Promise<ReturnEvaluation> {
  return advanceReturnStatus(clientId, taxYear, to)
}
