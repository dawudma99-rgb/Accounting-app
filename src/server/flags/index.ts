import { getClientSummary } from '@/lib/client'
import { supabaseServer } from '@/lib/supabase/server'
import { checkClientCompleteness } from '@/services/flags'
import type { ClientFlag } from '@/types/dashboard'

export async function runClientFlagCheck(clientId: string, taxYear: string): Promise<void> {
  const summary = await getClientSummary(clientId)
  await checkClientCompleteness(summary, taxYear)
}

export async function listClientFlags(clientId: string): Promise<ClientFlag[]> {
  const { data, error } = await supabaseServer
    .from('flags')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('raised_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientFlag[]
}

export async function resolveClientFlag(
  flagId: string,
  status: 'resolved' | 'overridden',
  overrideReason?: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from('flags')
    .update({
      status,
      resolved_at:     new Date().toISOString(),
      override_reason: overrideReason ?? null,
    })
    .eq('id', flagId)

  if (error) throw new Error(error.message)
}

export async function countOpenFlagsByClient(): Promise<Record<string, number>> {
  const { data, error } = await supabaseServer
    .from('flags')
    .select('client_id')
    .eq('status', 'open')

  if (error) return {}

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.client_id] = (acc[row.client_id] ?? 0) + 1
    return acc
  }, {})
}
