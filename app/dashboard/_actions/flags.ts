'use server'

import {
  countOpenFlagsByClient,
  listClientFlags,
  resolveClientFlag,
  runClientFlagCheck,
} from '@/server/flags'
import type { ClientFlag } from './types'

export async function runFlagCheck(clientId: string, taxYear: string): Promise<void> {
  return runClientFlagCheck(clientId, taxYear)
}

export async function getClientFlags(clientId: string): Promise<ClientFlag[]> {
  return listClientFlags(clientId)
}

export async function resolveFlag(
  flagId: string,
  status: 'resolved' | 'overridden',
  overrideReason?: string,
): Promise<void> {
  return resolveClientFlag(flagId, status, overrideReason)
}

export async function getClientFlagCounts(): Promise<Record<string, number>> {
  return countOpenFlagsByClient()
}
