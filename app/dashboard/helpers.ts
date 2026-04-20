import type { DashboardTransaction, MerchantMemory } from './types'

export function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2)
  return amount >= 0 ? `+£${abs}` : `-£${abs}`
}

export function confidenceRowClass(confidence: number): string {
  if (confidence >= 90) return 'bg-white hover:bg-zinc-50'
  if (confidence >= 70) return 'bg-amber-50 hover:bg-amber-100/70'
  return 'bg-red-50 hover:bg-red-100/70'
}

export function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 90) return 'bg-zinc-100 text-zinc-700'
  if (confidence >= 70) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

/**
 * Apply saved rules from memory to already-categorised transactions.
 * Keyed by regex pattern — tests each pattern against the transaction
 * description so memory survives across sessions (patterns come from Supabase).
 */
export function applyMemory(
  base: DashboardTransaction[],
  memory: MerchantMemory,
): DashboardTransaction[] {
  if (memory.size === 0) return base

  return base.map((t) => {
    for (const [pattern, { category }] of memory) {
      let matches = false
      try {
        matches = new RegExp(pattern, 'i').test(t.description)
      } catch {
        continue
      }
      if (!matches) continue
      return {
        ...t,
        category,
        confidence: 99,
        source:        'memory' as const,
        status:        'approved' as const,
        reviewReason:  undefined,
        matchedPattern: pattern,
      }
    }
    return t
  })
}
