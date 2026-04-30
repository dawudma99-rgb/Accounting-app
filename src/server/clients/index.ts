import { DEFAULT_TAX_YEAR } from '@/config/taxYears'
import { getClientSummary } from '@/lib/client'
import { supabaseServer } from '@/lib/supabase/server'
import { checkClientCompleteness } from '@/services/flags'
import type { ClientRecord, SavedTaxYearSummary } from '@/types/dashboard'
import type { BusinessType } from '@/types/transaction'

export async function getClientById(id: string): Promise<ClientRecord | null> {
  const { data, error } = await supabaseServer
    .from('clients')
    .select('id, name, business_type, utr, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data ?? null) as ClientRecord | null
}

export async function listClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabaseServer
    .from('clients')
    .select('id, name, business_type, utr, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientRecord[]
}

export async function createClientProfile(input: {
  name: string
  businessType: BusinessType
  utr?: string | null
}): Promise<ClientRecord> {
  const { data, error } = await supabaseServer
    .from('clients')
    .insert({
      name:          input.name,
      business_type: input.businessType,
      utr:           input.utr ?? null,
    })
    .select('id, name, business_type, utr, created_at')
    .single()

  if (error) throw new Error(error.message)

  try {
    const client = await getClientSummary(data.id)
    await checkClientCompleteness(client, DEFAULT_TAX_YEAR)
  } catch (flagErr) {
    console.warn('[flags] Profile check failed after createClient:', (flagErr as Error).message)
  }

  return data as ClientRecord
}

export async function listClientTaxYears(clientId: string): Promise<SavedTaxYearSummary[]> {
  const { data, error } = await supabaseServer
    .from('tax_years')
    .select('id, tax_year, gross_income, total_expenses, net_profit, total_liability, return_status, figures_saved_at')
    .eq('client_id', clientId)
    .order('tax_year', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as SavedTaxYearSummary[]
}
