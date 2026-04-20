import type { BusinessType, TransactionCategory } from '@/types/transaction'
import type { DashboardTransaction, MatchSource } from './types'

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  fuel:          'Fuel',
  materials:     'Materials',
  tools:         'Tools',
  insurance:     'Insurance',
  software:      'Software',
  subcontractor: 'Subcontractor',
  income:        'Income',
  other:         'Other',
}

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  fuel:          'bg-zinc-100 text-zinc-700',
  materials:     'bg-zinc-100 text-zinc-700',
  tools:         'bg-zinc-100 text-zinc-700',
  insurance:     'bg-zinc-100 text-zinc-700',
  software:      'bg-zinc-100 text-zinc-700',
  subcontractor: 'bg-zinc-100 text-zinc-700',
  income:        'bg-zinc-100 text-zinc-700',
  other:         'bg-zinc-100 text-zinc-500',
}

export const MATCH_SOURCE_CONFIG: Record<MatchSource, { label: string; className: string }> = {
  receipt:             { label: 'Matched to receipt',             className: 'bg-zinc-100 text-zinc-700'   },
  'receipt-uncertain': { label: 'Matched to receipt (uncertain)', className: 'bg-amber-50 text-amber-700'  },
  platform:            { label: 'Matched to platform',           className: 'bg-zinc-100 text-zinc-700'   },
  unmatched:           { label: 'Unmatched',                     className: 'bg-zinc-100 text-zinc-500'   },
}

export const SOURCE_CONFIG: Record<DashboardTransaction['source'], { label: string; className: string }> = {
  ai:        { label: 'AI classified', className: 'bg-zinc-100 text-zinc-700' },
  rules:     { label: 'Cached rule',   className: 'bg-zinc-100 text-zinc-700' },
  hardcoded: { label: 'Built-in rule', className: 'bg-zinc-100 text-zinc-600' },
  memory:    { label: 'Confirmed',     className: 'bg-zinc-100 text-zinc-700' },
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  taxi:     'Taxi driver',
  mechanic: 'Mechanic',
  plumber:  'Plumber',
}

export const CONFIDENCE_OPTIONS = [
  { label: 'Any confidence',  value: 0  },
  { label: '≥70% confidence', value: 70 },
  { label: '≥80% confidence', value: 80 },
  { label: '≥90% confidence', value: 90 },
]

export const SOURCE_OPTIONS: Array<{ label: string; value: DashboardTransaction['source'] | 'all' }> = [
  { label: 'All sources',   value: 'all'   },
  { label: 'AI classified', value: 'ai'    },
  { label: 'Cached rule',   value: 'rules' },
]
