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
  fuel:          'bg-orange-100 text-orange-700',
  materials:     'bg-blue-100 text-blue-700',
  tools:         'bg-purple-100 text-purple-700',
  insurance:     'bg-indigo-100 text-indigo-700',
  software:      'bg-cyan-100 text-cyan-700',
  subcontractor: 'bg-pink-100 text-pink-700',
  income:        'bg-emerald-100 text-emerald-700',
  other:         'bg-gray-100 text-gray-600',
}

export const MATCH_SOURCE_CONFIG: Record<MatchSource, { label: string; className: string }> = {
  receipt:             { label: 'Matched to receipt',             className: 'bg-emerald-100 text-emerald-700' },
  'receipt-uncertain': { label: 'Matched to receipt (uncertain)', className: 'bg-yellow-100 text-yellow-700'  },
  platform:            { label: 'Matched to platform',           className: 'bg-blue-100 text-blue-700'      },
  unmatched:           { label: 'Unmatched',                     className: 'bg-gray-100 text-gray-500'      },
}

export const SOURCE_CONFIG: Record<DashboardTransaction['source'], { label: string; className: string }> = {
  ai:        { label: 'AI classified', className: 'bg-purple-100 text-purple-700'   },
  rules:     { label: 'Cached rule',   className: 'bg-indigo-100 text-indigo-700'   },
  hardcoded: { label: 'Built-in rule', className: 'bg-slate-100 text-slate-600'     },
  memory:    { label: 'Confirmed',     className: 'bg-emerald-100 text-emerald-700' },
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
