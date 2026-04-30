'use server'

import {
  createClientProfile,
  getClientById,
  listClients,
  listClientTaxYears,
} from '@/server/clients'
import type { BusinessType } from '@/types/transaction'
import type { ClientRecord, SavedTaxYearSummary } from './types'

export async function getClients(): Promise<ClientRecord[]> {
  return listClients()
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  return getClientById(id)
}

export async function createClient(input: {
  name: string
  businessType: BusinessType
  utr?: string | null
}): Promise<ClientRecord> {
  return createClientProfile(input)
}

export async function getClientTaxYears(clientId: string): Promise<SavedTaxYearSummary[]> {
  return listClientTaxYears(clientId)
}
