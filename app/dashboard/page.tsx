'use client'

import { useState, useRef, useEffect } from 'react'
import { TRANSACTION_CATEGORIES, type BusinessType, type TransactionCategory } from '@/types/transaction'
import { parseMonzoCSV } from '@/services/bankFeed'
import { parseUberCSV } from '@/services/platformFeed/uber'
import type { UberWeeklyRow } from '@/services/platformFeed/uber'
import { matchPlatformPayouts } from '@/services/matching/platform'
import type { UnmatchedPayout } from '@/services/matching/platform'
import { matchReceiptTransactions } from '@/services/matching/receipt'
import type { UnmatchedReceipt } from '@/services/matching/receipt'
import type { ExtractedReceipt } from '@/services/ocr/receipt'
import { serialiseToCsv } from '@/lib/export/csv'
import type { ExportRow } from '@/lib/export/csv'
import {
  bulkConfirmTransactions,
  confirmTransaction,
  createClient,
  getClientTransactions,
  getClients,
  getTaxSummary,
  loadConfirmedRules,
  ocrReceipts,
  processTransactions,
  saveRunTransactions,
} from './actions'
import type { ClientRecord, SavedTransaction } from './actions'
import { DEFAULT_TAX_YEAR, getAvailableTaxYears, getTaxYearConfig } from '@/config/taxYears'
import type { TaxSummary } from '@/types/tax'
import { buildSA103Draft } from '@/services/tax/sa103Draft'
import type { SA103Draft } from '@/types/sa103'

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'dashboard' | 'clients' | 'client-detail' | 'tax'

type MatchSource = 'receipt' | 'receipt-uncertain' | 'platform' | 'unmatched'

interface DashboardTransaction {
  id: string
  date: string
  /** Full bank-statement description text */
  description: string
  /** Clean display name shown in the UI */
  merchant: string
  amount: number
  category: TransactionCategory
  confidence: number
  /** 'hardcoded' = built-in rule, 'memory' = user-confirmed in a prior run */
  source: 'ai' | 'rules' | 'hardcoded' | 'memory'
  reasoning: string
  matchSource: MatchSource
  reviewReason?: string
  status: 'approved' | 'flagged' | 'pending'
  /** Regex pattern from the engine — passed back to confirmRule on approve */
  matchedPattern?: string
  /** The platform payout row this transaction was matched to. */
  matchedRow?: UberWeeklyRow
  /** The extracted receipt this transaction was matched to. */
  matchedReceipt?: ExtractedReceipt
}

/** Merchant memory: pattern (regex) → { category, pattern } */
type MerchantMemory = Map<string, { category: TransactionCategory; pattern: string }>

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  fuel: 'Fuel', materials: 'Materials', tools: 'Tools',
  insurance: 'Insurance', software: 'Software',
  subcontractor: 'Subcontractor', income: 'Income', other: 'Other',
}

const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  fuel:          'bg-orange-100 text-orange-700',
  materials:     'bg-blue-100 text-blue-700',
  tools:         'bg-purple-100 text-purple-700',
  insurance:     'bg-indigo-100 text-indigo-700',
  software:      'bg-cyan-100 text-cyan-700',
  subcontractor: 'bg-pink-100 text-pink-700',
  income:        'bg-emerald-100 text-emerald-700',
  other:         'bg-gray-100 text-gray-600',
}

const MATCH_SOURCE_CONFIG: Record<MatchSource, { label: string; className: string }> = {
  receipt:             { label: 'Matched to receipt',           className: 'bg-emerald-100 text-emerald-700' },
  'receipt-uncertain': { label: 'Matched to receipt (uncertain)', className: 'bg-yellow-100 text-yellow-700' },
  platform:            { label: 'Matched to platform',          className: 'bg-blue-100 text-blue-700'      },
  unmatched:           { label: 'Unmatched',                    className: 'bg-gray-100 text-gray-500'      },
}

const SOURCE_CONFIG: Record<DashboardTransaction['source'], { label: string; className: string }> = {
  ai:        { label: 'AI classified', className: 'bg-purple-100 text-purple-700'  },
  rules:     { label: 'Cached rule',   className: 'bg-indigo-100 text-indigo-700'  },
  hardcoded: { label: 'Built-in rule', className: 'bg-slate-100 text-slate-600'    },
  memory:    { label: 'Confirmed',     className: 'bg-emerald-100 text-emerald-700' },
}

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  taxi:     'Taxi driver',
  mechanic: 'Mechanic',
  plumber:  'Plumber',
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2Z" />
      <path d="M9 10h6M9 14h6" />
    </svg>
  )
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function TaxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="12" y2="17" />
      <line x1="9" y1="9" x2="10" y2="9" />
    </svg>
  )
}
function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path d="M9.5 2a4.5 4.5 0 0 1 4.5 4.5v.5h.5a4 4 0 0 1 0 8H9.5A4.5 4.5 0 0 1 5 10.5v-4A4.5 4.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2a4.5 4.5 0 0 0-4.5 4.5" /><path d="M5 10.5A4.5 4.5 0 0 0 9.5 15" />
      <line x1="12" y1="15" x2="12" y2="22" /><line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2)
  return amount >= 0 ? `+£${abs}` : `-£${abs}`
}

function confidenceRowClass(confidence: number): string {
  if (confidence >= 90) return 'bg-emerald-50 hover:bg-emerald-100'
  if (confidence >= 70) return 'bg-amber-50 hover:bg-amber-100'
  return 'bg-red-50 hover:bg-red-100'
}

function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 90) return 'bg-emerald-100 text-emerald-700'
  if (confidence >= 70) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

/**
 * Apply saved rules from memory to already-categorised transactions.
 * Keyed by regex pattern — tests each pattern against the transaction
 * description so memory survives across sessions (patterns come from Supabase).
 */
function applyMemory(
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
        source: 'memory' as const,
        status: 'approved' as const,
        reviewReason: undefined,
        matchedPattern: pattern,
      }
    }
    return t
  })
}

// ─── Bulk Approve Bar ─────────────────────────────────────────────────────────

const CONFIDENCE_OPTIONS = [
  { label: 'Any confidence',  value: 0  },
  { label: '≥70% confidence', value: 70 },
  { label: '≥80% confidence', value: 80 },
  { label: '≥90% confidence', value: 90 },
]

const SOURCE_OPTIONS: Array<{ label: string; value: DashboardTransaction['source'] | 'all' }> = [
  { label: 'All sources',   value: 'all'   },
  { label: 'AI classified', value: 'ai'    },
  { label: 'Cached rule',   value: 'rules' },
]

function BulkApproveBar({
  transactions,
  onApprove,
  isSaving,
}: {
  transactions: DashboardTransaction[]
  onApprove: (eligible: DashboardTransaction[]) => void
  isSaving: boolean
}) {
  const [confidenceMin,  setConfidenceMin]  = useState(0)
  const [sourceFilter,   setSourceFilter]   = useState<DashboardTransaction['source'] | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | 'all'>('all')

  const eligible = transactions.filter((t) => {
    if (t.source === 'rules' || t.source === 'memory') return false
    if (t.confidence < confidenceMin) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    return true
  })

  const categoryOptions: Array<{ label: string; value: TransactionCategory | 'all' }> = [
    { label: 'All categories', value: 'all' },
    ...TRANSACTION_CATEGORIES.map((c) => ({ label: CATEGORY_LABELS[c], value: c })),
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-3.5 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-gray-700 flex-none">Bulk approve</span>

      <select
        value={confidenceMin}
        onChange={(e) => setConfidenceMin(Number(e.target.value))}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {CONFIDENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={sourceFilter}
        onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {categoryOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <div className="flex-1" />

      <span className="text-xs text-gray-400">
        {eligible.length} transaction{eligible.length !== 1 ? 's' : ''} match
      </span>

      <button
        onClick={() => onApprove(eligible)}
        disabled={isSaving || eligible.length === 0}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
      >
        {isSaving ? (
          <><SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> Saving…</>
        ) : (
          <><CheckIcon className="w-3.5 h-3.5" /> Save {eligible.length} rule{eligible.length !== 1 ? 's' : ''} to rulebook</>
        )}
      </button>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  currentView,
  onNavigate,
}: {
  currentView: View
  onNavigate: (view: View) => void
}) {
  const navItems: Array<{
    label: string
    icon: (p: { className?: string }) => React.ReactElement
    view: View | null
  }> = [
    { label: 'Dashboard',    icon: GridIcon,     view: 'dashboard' },
    { label: 'Clients',      icon: UsersIcon,    view: 'clients'   },
    { label: 'Tax Summary',  icon: TaxIcon,      view: 'tax'       },
    { label: 'Transactions', icon: ListIcon,     view: null        },
    { label: 'Receipts',     icon: ReceiptIcon,  view: null        },
    { label: 'Settings',     icon: SettingsIcon, view: null        },
  ]

  // Clients nav item stays highlighted when viewing a client's detail
  function isActive(view: View | null): boolean {
    if (view === null) return false
    if (view === 'clients') return currentView === 'clients' || currentView === 'client-detail'
    return currentView === view
  }

  return (
    <aside className="w-60 flex-none bg-slate-900 flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-none">
            <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight tracking-tight">TradeLedger</p>
            <p className="text-slate-400 text-xs">Self Assessment</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ label, icon: Icon, view }) => (
          <button
            key={label}
            onClick={() => view && onNavigate(view)}
            disabled={!view}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(view)
                ? 'bg-indigo-600 text-white cursor-pointer'
                : view
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed opacity-40'
            }`}
          >
            <Icon className="w-4.5 h-4.5 flex-none" />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800">
          <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-none">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-xs font-medium truncate">John Davies</p>
            <p className="text-slate-500 text-xs truncate">Sole Trader</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({
  onProcess,
  isProcessing,
  bankStatements,
  onBankStatementsChange,
  platformStatements,
  onPlatformStatementsChange,
  receipts,
  onReceiptsChange,
}: {
  onProcess: () => void
  isProcessing: boolean
  bankStatements: File[]
  onBankStatementsChange: (files: File[]) => void
  platformStatements: File[]
  onPlatformStatementsChange: (files: File[]) => void
  receipts: File[]
  onReceiptsChange: (files: File[]) => void
}) {
  const bankRef     = useRef<HTMLInputElement>(null)
  const receiptsRef = useRef<HTMLInputElement>(null)
  const platformRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Import Data</h2>
      <div className="grid grid-cols-3 gap-4">
        <UploadZone
          label="Bank Statements" description="CSV exports from your bank" accept=".csv"
          files={bankStatements} inputRef={bankRef}
          onAdd={(f) => onBankStatementsChange([...bankStatements, ...Array.from(f)])}
          onRemove={(i) => onBankStatementsChange(bankStatements.filter((_, idx) => idx !== i))}
        />
        <UploadZone
          label="Receipts" description="JPG or PNG images" accept="image/jpeg,image/png,image/gif,image/webp"
          files={receipts} inputRef={receiptsRef}
          onAdd={(f) => onReceiptsChange([...receipts, ...Array.from(f)])}
          onRemove={(i) => onReceiptsChange(receipts.filter((_, idx) => idx !== i))}
        />
        <UploadZone
          label="Platform Statements" description="Uber, Checkatrade CSV" accept=".csv"
          files={platformStatements} inputRef={platformRef}
          onAdd={(f) => onPlatformStatementsChange([...platformStatements, ...Array.from(f)])}
          onRemove={(i) => onPlatformStatementsChange(platformStatements.filter((_, idx) => idx !== i))}
        />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {bankStatements.length > 0
            ? 'Ready to process'
            : 'Upload at least one bank statement CSV to continue'}
        </p>
        <button
          onClick={onProcess}
          disabled={isProcessing || bankStatements.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <><SpinnerIcon className="w-4 h-4 animate-spin" /> Processing…</>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
              Run Categorisation
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function UploadZone({
  label, description, accept, files, inputRef, onAdd, onRemove,
}: {
  label: string; description: string; accept: string
  files: File[]; inputRef: React.RefObject<HTMLInputElement | null>
  onAdd: (files: FileList) => void; onRemove: (index: number) => void
}) {
  function handleClick() {
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.click()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input ref={inputRef} type="file" accept={accept} multiple className="hidden"
        onChange={(e) => e.target.files && onAdd(e.target.files)} />

      <button
        onClick={handleClick}
        className="w-full h-[72px] flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg transition-colors cursor-pointer group"
      >
        <UploadIcon className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
        <p className="text-xs font-medium text-gray-500 group-hover:text-indigo-600 transition-colors">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </button>

      {files.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <CheckIcon className="w-3 h-3 text-emerald-500 flex-none" />
              <p className="flex-1 text-xs text-gray-700 truncate min-w-0">{f.name}</p>
              <button
                onClick={() => onRemove(i)}
                className="flex-none text-gray-300 hover:text-red-400 transition-colors cursor-pointer"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ transactions }: { transactions: DashboardTransaction[] }) {
  const income   = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const approved = transactions.filter((t) => t.status === 'approved').length
  const flagged  = transactions.filter((t) => t.status === 'flagged').length

  const cards = [
    { label: 'Total Transactions', value: transactions.length.toString(), sub: 'this period',
      color: 'text-gray-900', dot: 'bg-slate-400' },
    { label: 'Total Income',  value: `£${income.toFixed(2)}`,
      sub: `${transactions.filter((t) => t.amount > 0).length} transactions`,
      color: 'text-emerald-700', dot: 'bg-emerald-500' },
    { label: 'Total Expenses', value: `£${expenses.toFixed(2)}`,
      sub: `${transactions.filter((t) => t.amount < 0).length} transactions`,
      color: 'text-red-600', dot: 'bg-red-500' },
    { label: 'Auto-Approved', value: approved.toString(),
      sub: transactions.length > 0 ? `${Math.round((approved / transactions.length) * 100)}% of total` : '—',
      color: 'text-emerald-700', dot: 'bg-emerald-500' },
    { label: 'Flagged for Review', value: flagged.toString(), sub: 'need attention',
      color: flagged > 0 ? 'text-amber-600' : 'text-gray-400',
      dot:   flagged > 0 ? 'bg-amber-500'  : 'bg-gray-300'  },
  ]

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full flex-none ${c.dot}`} />
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
          </div>
          <p className={`text-2xl font-bold tracking-tight ${c.color}`}>{c.value}</p>
          <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Transactions Table ───────────────────────────────────────────────────────

function TransactionsTable({
  transactions, onSelect,
}: {
  transactions: DashboardTransaction[]
  onSelect: (t: DashboardTransaction) => void
}) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Transactions</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <ListIcon className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">No transactions yet</p>
          <p className="text-xs text-gray-400 mt-1">Upload a bank statement and click Run Categorisation</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Transactions
          <span className="ml-2 text-xs font-normal text-gray-400">{transactions.length} records</span>
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-200 inline-block" />90%+</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-200 inline-block" />70–89%</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-200 inline-block" />&lt;70%</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Merchant</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((t) => {
              const match = MATCH_SOURCE_CONFIG[t.matchSource]
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className={`cursor-pointer transition-colors ${confidenceRowClass(t.confidence)}`}
                >
                  <td className="px-6 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[180px] truncate">
                    {t.merchant}
                    {t.reviewReason && (
                      <span className="ml-1.5 inline-flex items-center">
                        <AlertIcon className="w-3 h-3 text-amber-500" />
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${t.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatAmount(t.amount)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[t.category]}`}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${confidenceBadgeClass(t.confidence)}`}>
                      {t.confidence}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${match.className}`}>
                      {match.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : t.status === 'flagged'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.status === 'approved' ? 'Approved' : t.status === 'flagged' ? 'Flagged' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-300">
                    <ChevronRightIcon className="w-4 h-4" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  transaction, onClose, onApprove, onRecategorise,
}: {
  transaction: DashboardTransaction
  onClose: () => void
  onApprove: (id: string) => void
  onRecategorise: (id: string) => void
}) {
  const match = MATCH_SOURCE_CONFIG[transaction.matchSource]
  const src   = SOURCE_CONFIG[transaction.source]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className={`px-6 py-5 ${
          transaction.confidence >= 90 ? 'bg-emerald-50 border-b border-emerald-100'
          : transaction.confidence >= 70 ? 'bg-amber-50 border-b border-amber-100'
          : 'bg-red-50 border-b border-red-100'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">{transaction.date}</p>
              <h3 className="text-lg font-bold text-gray-900">{transaction.merchant}</h3>
              <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${transaction.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatAmount(transaction.amount)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {transaction.reviewReason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Flagged for review</p>
                <p className="text-xs text-amber-600 mt-0.5">{transaction.reviewReason}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">Category</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${CATEGORY_COLORS[transaction.category]}`}>
                {CATEGORY_LABELS[transaction.category]}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Classification</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${src.className}`}>
                {src.label}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-sm font-bold tabular-nums ${
                transaction.confidence >= 90 ? 'text-emerald-600'
                : transaction.confidence >= 70 ? 'text-amber-600'
                : 'text-red-600'
              }`}>{transaction.confidence}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  transaction.confidence >= 90 ? 'bg-emerald-500'
                  : transaction.confidence >= 70 ? 'bg-amber-400'
                  : 'bg-red-500'
                }`}
                style={{ width: `${transaction.confidence}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <BrainIcon className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-400">AI Reasoning</p>
            </div>
            <blockquote className="text-sm text-gray-700 leading-relaxed bg-gray-50 border-l-4 border-indigo-300 px-4 py-3 rounded-r-lg italic">
              {transaction.reasoning}
            </blockquote>
          </div>

          <div className="flex flex-col gap-1.5 py-3 px-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-600">Evidence match</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${match.className}`}>
                {match.label}
              </span>
            </div>
            {transaction.matchedReceipt && (
              <div className="mt-1 text-xs text-gray-500 space-y-0.5 pl-6">
                <p><span className="font-medium">Receipt:</span> {transaction.matchedReceipt.fileName}</p>
                <p><span className="font-medium">Merchant:</span> {transaction.matchedReceipt.merchant}</p>
                <p><span className="font-medium">Amount:</span> £{transaction.matchedReceipt.amount.toFixed(2)}</p>
                <p><span className="font-medium">Date:</span> {transaction.matchedReceipt.date}</p>
                <p><span className="font-medium">Clarity:</span> {transaction.matchedReceipt.confidence}%</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={() => { onApprove(transaction.id); onClose() }}
            disabled={transaction.status === 'approved'}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckIcon className="w-4 h-4" />
            {transaction.status === 'approved' ? 'Already approved' : 'Approve & remember'}
          </button>
          <button
            onClick={() => { onRecategorise(transaction.id); onClose() }}
            className="flex-1 py-2.5 border-2 border-gray-200 hover:border-indigo-400 hover:text-indigo-600 text-gray-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Recategorise
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Client Modal ──────────────────────────────────────────────────────

function CreateClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (client: ClientRecord) => void
}) {
  const [name,         setName]         = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('taxi')
  const [utr,          setUtr]          = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const client = await createClient({ name: name.trim(), businessType, utr: utr.trim() || null })
      onCreated(client)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">New Client</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Davies"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Trade <span className="text-red-500">*</span>
            </label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessType)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-900 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="taxi">Taxi driver</option>
              <option value="mechanic">Mechanic</option>
              <option value="plumber">Plumber</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              UTR <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="10-digit HMRC reference"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {saving ? <><SpinnerIcon className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Clients View ─────────────────────────────────────────────────────────────

function ClientsView({
  onViewClient,
  onNewClient,
}: {
  onViewClient: (client: ClientRecord) => void
  onNewClient: (client: ClientRecord) => void
}) {
  const [clients,     setClients]     = useState<ClientRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)

  useEffect(() => {
    getClients()
      .then(setClients)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Clients</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? 'Loading…' : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
        >
          + New Client
        </button>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <SpinnerIcon className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <UsersIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No clients yet</p>
            <p className="text-xs text-gray-400 mt-1">Create a client to start processing their transactions</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              + New Client
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">UTR</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => onViewClient(client)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-medium text-gray-900">{client.name}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">
                        {BUSINESS_TYPE_LABELS[client.business_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 font-mono text-xs">
                      {client.utr ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(client.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3.5 text-gray-300">
                      <ChevronRightIcon className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onCreated={(client) => {
            setClients((prev) => [client, ...prev])
            setShowCreate(false)
            onNewClient(client)
          }}
        />
      )}
    </>
  )
}

// ─── History Detail Modal ─────────────────────────────────────────────────────

function HistoryDetailModal({
  transaction,
  onClose,
}: {
  transaction: SavedTransaction
  onClose: () => void
}) {
  const amt        = Number(transaction.amount)
  const confidence = transaction.confidence_score
  const cat        = transaction.category as TransactionCategory
  const src        = transaction.source as DashboardTransaction['source'] | null
  const matchSrc   = transaction.match_source as MatchSource | null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 ${
          confidence >= 90 ? 'bg-emerald-50 border-b border-emerald-100'
          : confidence >= 70 ? 'bg-amber-50 border-b border-amber-100'
          : 'bg-red-50 border-b border-red-100'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-0.5">
                {new Date(transaction.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h3 className="text-lg font-bold text-gray-900">
                {transaction.merchant ?? transaction.description ?? '—'}
              </h3>
              <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${amt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {amt >= 0 ? `+£${amt.toFixed(2)}` : `-£${Math.abs(amt).toFixed(2)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Review reason banner */}
          {transaction.review_reason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Flagged for review</p>
                <p className="text-xs text-amber-600 mt-0.5">{transaction.review_reason}</p>
              </div>
            </div>
          )}

          {/* Category + source */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">Category</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                {CATEGORY_LABELS[cat] ?? transaction.category}
              </span>
            </div>
            {src && (
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Classification</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium ${SOURCE_CONFIG[src]?.className ?? 'bg-gray-100 text-gray-600'}`}>
                  {SOURCE_CONFIG[src]?.label ?? src}
                </span>
              </div>
            )}
          </div>

          {/* Confidence bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-sm font-bold tabular-nums ${
                confidence >= 90 ? 'text-emerald-600'
                : confidence >= 70 ? 'text-amber-600'
                : 'text-red-600'
              }`}>{confidence}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  confidence >= 90 ? 'bg-emerald-500'
                  : confidence >= 70 ? 'bg-amber-400'
                  : 'bg-red-500'
                }`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          {/* AI Reasoning */}
          {transaction.reasoning && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <BrainIcon className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs text-gray-400">AI Reasoning</p>
              </div>
              <blockquote className="text-sm text-gray-700 leading-relaxed bg-gray-50 border-l-4 border-indigo-300 px-4 py-3 rounded-r-lg italic">
                {transaction.reasoning}
              </blockquote>
            </div>
          )}

          {/* Match source */}
          {matchSrc && (
            <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <ReceiptIcon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-600">Evidence match</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${MATCH_SOURCE_CONFIG[matchSrc]?.className ?? 'bg-gray-100 text-gray-500'}`}>
                {MATCH_SOURCE_CONFIG[matchSrc]?.label ?? matchSrc}
              </span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Detail View ───────────────────────────────────────────────────────

function ClientDetailView({
  client,
  onBack,
}: {
  client: ClientRecord
  onBack: () => void
}) {
  const [savedTransactions, setSavedTransactions] = useState<SavedTransaction[]>([])
  const [loading,           setLoading]           = useState(true)
  const [selected,          setSelected]          = useState<SavedTransaction | null>(null)

  useEffect(() => {
    getClientTransactions(client.id)
      .then(setSavedTransactions)
      .finally(() => setLoading(false))
  }, [client.id])

  const income   = savedTransactions.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
  const expenses = savedTransactions.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Clients
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <div>
            <h1 className="text-base font-semibold text-gray-900">{client.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{BUSINESS_TYPE_LABELS[client.business_type]}</p>
          </div>
        </div>
        {client.utr && (
          <span className="text-xs text-gray-400 font-mono">UTR: {client.utr}</span>
        )}
      </div>

      <div className="px-8 py-6 space-y-5 max-w-7xl">
        {!loading && savedTransactions.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <p className="text-xs text-gray-500 font-medium">Total Transactions</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-gray-900">{savedTransactions.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="text-xs text-gray-500 font-medium">Total Income</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-emerald-700">£{income.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <p className="text-xs text-gray-500 font-medium">Total Expenses</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-red-600">£{expenses.toFixed(2)}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Transaction History
              {!loading && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {savedTransactions.length} record{savedTransactions.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <SpinnerIcon className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : savedTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-gray-500">No transactions yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Select this client on the Dashboard and run a categorisation to save results here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Merchant</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {savedTransactions.map((t) => {
                    const amt = Number(t.amount)
                    const cat = t.category as TransactionCategory
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`cursor-pointer transition-colors ${confidenceRowClass(t.confidence_score)}`}
                      >
                        <td className="px-6 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {new Date(t.date).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-900 max-w-[200px] truncate">
                          {t.merchant ?? t.description ?? '—'}
                          {t.review_reason && (
                            <span className="ml-1.5 inline-flex items-center">
                              <AlertIcon className="w-3 h-3 text-amber-500" />
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${amt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {amt >= 0 ? `+£${amt.toFixed(2)}` : `-£${Math.abs(amt).toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                            {CATEGORY_LABELS[cat] ?? t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${confidenceBadgeClass(t.confidence_score)}`}>
                            {t.confidence_score}%
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'auto_approved' || t.status === 'reviewed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : t.status === 'flagged'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {t.status === 'auto_approved' ? 'Approved'
                              : t.status === 'reviewed' ? 'Reviewed'
                              : t.status === 'flagged'   ? 'Flagged'
                              : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-300">
                          <ChevronRightIcon className="w-4 h-4" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <HistoryDetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// ─── Tax Summary View ─────────────────────────────────────────────────────────

function TaxView({
  selectedClient,
  allClients,
  onSelectClient,
}: {
  selectedClient:  ClientRecord | null
  allClients:      ClientRecord[]
  onSelectClient:  (c: ClientRecord | null) => void
}) {
  const availableYears                                    = getAvailableTaxYears()
  const [taxYear,            setTaxYear]                  = useState(DEFAULT_TAX_YEAR)
  const [milesInput,         setMilesInput]               = useState('')
  const [appliedMiles,       setAppliedMiles]             = useState<number | undefined>(undefined)
  const [otherIncomeInput,   setOtherIncomeInput]         = useState('')
  const [appliedOtherIncome, setAppliedOtherIncome]       = useState<number | undefined>(undefined)
  const [summary,            setSummary]                  = useState<TaxSummary | null>(null)
  const [loading,            setLoading]                  = useState(false)
  const [error,              setError]                    = useState<string | null>(null)

  useEffect(() => {
    if (!selectedClient) { setSummary(null); return }
    setLoading(true)
    setError(null)
    getTaxSummary(selectedClient.id, taxYear, appliedMiles, appliedOtherIncome)
      .then(setSummary)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedClient?.id, taxYear, appliedMiles, appliedOtherIncome]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleApplyMileage() {
    const miles = Number(milesInput.replace(/,/g, ''))
    if (!Number.isFinite(miles) || miles <= 0) return
    setAppliedMiles(miles)
  }

  function handleClearMileage() {
    setMilesInput('')
    setAppliedMiles(undefined)
  }

  function handleApplyOtherIncome() {
    const amount = Number(otherIncomeInput.replace(/,/g, '').replace(/£/g, ''))
    if (!Number.isFinite(amount) || amount < 0) return
    setAppliedOtherIncome(amount === 0 ? undefined : amount)
  }

  function handleClearOtherIncome() {
    setOtherIncomeInput('')
    setAppliedOtherIncome(undefined)
  }

  function formatDate(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number)
    const months = ['January','February','March','April','May','June','July',
                    'August','September','October','November','December']
    return `${day} ${months[month - 1]} ${year}`
  }

  function fmt(n: number): string {
    return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Tax Summary</h1>
            <p className="text-xs text-gray-400 mt-0.5">Self-employment profit calculation</p>
          </div>

          <select
            value={selectedClient?.id ?? ''}
            onChange={(e) => {
              const client = allClients.find((c) => c.id === e.target.value) ?? null
              onSelectClient(client)
            }}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select client…</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={taxYear}
            onChange={(e) => { setTaxYear(e.target.value); setAppliedMiles(undefined); setMilesInput('') }}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>Tax year {y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {summary && summary.outOfRangeTransactionCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-blue-400 flex-none" />
              <span className="text-xs text-blue-700 font-medium">
                {summary.outOfRangeTransactionCount} transaction{summary.outOfRangeTransactionCount !== 1 ? 's' : ''} outside {taxYear} excluded — check tax year selection
              </span>
            </div>
          )}
          {summary && summary.flaggedTransactionCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <span className="text-xs text-amber-700 font-medium">
                {summary.flaggedTransactionCount} flagged transaction{summary.flaggedTransactionCount !== 1 ? 's' : ''} excluded — resolve in Dashboard first
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-5 max-w-4xl">

        {!selectedClient ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <TaxIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No client selected</p>
            <p className="text-xs text-gray-400 mt-1">Select a client above to view their tax summary</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-24">
            <SpinnerIcon className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertIcon className="w-4 h-4 text-red-500 flex-none mt-0.5" />
            <p>{error}</p>
          </div>
        ) : !summary ? null : (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-xs text-gray-500 font-medium">Turnover</p>
                </div>
                <p className="text-2xl font-bold tracking-tight text-emerald-700">{fmt(summary.turnover)}</p>
                <p className="text-xs text-gray-400 mt-1">{summary.incomeCount} income transaction{summary.incomeCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <p className="text-xs text-gray-500 font-medium">Total Allowable Expenses</p>
                </div>
                <p className="text-2xl font-bold tracking-tight text-red-600">{fmt(summary.totalAllowableExpenses)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Vehicle: {summary.vehicle.chosenMethod === 'mileage' ? 'mileage method' : 'actual costs'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-xs px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${summary.netProfit >= 0 ? 'bg-indigo-500' : 'bg-red-400'}`} />
                  <p className="text-xs text-gray-500 font-medium">{summary.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
                </div>
                <p className={`text-2xl font-bold tracking-tight ${summary.netProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                  {summary.netProfit < 0 ? '−' : ''}{fmt(summary.netProfit)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Turnover minus all deductions</p>
              </div>
            </div>

            {/* ── Detailed breakdown ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Expense Breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">Tax year {summary.taxYear} · {summary.approvedTransactionCount} approved transactions</p>
              </div>

              {/* Non-vehicle expenses */}
              {summary.nonVehicleExpenses.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Non-vehicle expenses</p>
                  <div className="space-y-2.5">
                    {summary.nonVehicleExpenses.map((exp) => (
                      <div key={exp.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[exp.category]}`}>
                            {CATEGORY_LABELS[exp.category]}
                          </span>
                          <span className="text-xs text-gray-400">{exp.count} transaction{exp.count !== 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(exp.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500">Subtotal — non-vehicle</span>
                    <span className="text-sm font-bold text-gray-700 tabular-nums">{fmt(summary.totalNonVehicleExpenses)}</span>
                  </div>
                </div>
              )}

              {/* Vehicle expenses */}
              <div className="px-6 py-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Vehicle expenses</p>

                <div className="space-y-3">
                  {/* Actual costs row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm text-gray-700">Actual fuel / vehicle costs</span>
                      {summary.vehicle.chosenMethod === 'actual' && summary.vehicle.mileageAllowance !== null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                          ✓ Using this · saves {fmt(summary.vehicle.saving!)}
                        </span>
                      )}
                      {summary.vehicle.chosenMethod === 'actual' && summary.vehicle.mileageAllowance === null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                          Using this
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(summary.vehicle.actualCosts)}</span>
                  </div>

                  {/* Mileage allowance row */}
                  {summary.vehicle.mileageAllowance !== null && (
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-sm text-gray-700">
                          HMRC mileage allowance ({summary.vehicle.businessMiles!.toLocaleString()} miles)
                        </span>
                        {summary.vehicle.chosenMethod === 'mileage' && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                            ✓ Using this · saves {fmt(summary.vehicle.saving!)}
                          </span>
                        )}
                        {summary.vehicle.mileageBandBreakdown && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {summary.vehicle.mileageBandBreakdown.map((b, i) => (
                              <span key={i}>{i > 0 ? ' + ' : ''}{b.miles.toLocaleString()} mi × {(b.ratePerMile * 100).toFixed(0)}p</span>
                            ))}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(summary.vehicle.mileageAllowance)}</span>
                    </div>
                  )}
                </div>

                {/* Mileage input */}
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {summary.vehicle.mileageAllowance === null ? 'Compare vs mileage allowance:' : 'Update mileage:'}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 8,500"
                    value={milesInput}
                    onChange={(e) => setMilesInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyMileage()}
                    className="w-28 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <span className="text-xs text-gray-400">business miles</span>
                  <button
                    onClick={handleApplyMileage}
                    disabled={!milesInput.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Compare
                  </button>
                  {summary.vehicle.mileageAllowance !== null && (
                    <button
                      onClick={handleClearMileage}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-500">
                    Vehicle deduction ({summary.vehicle.chosenMethod === 'mileage' ? 'mileage method' : 'actual costs'})
                  </span>
                  <span className="text-sm font-bold text-gray-700 tabular-nums">{fmt(summary.vehicle.chosenAmount)}</span>
                </div>
              </div>

              {/* Final totals */}
              <div className="px-6 py-5 bg-gray-50/60 space-y-2.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Non-vehicle expenses</span>
                  <span className="font-semibold text-gray-700 tabular-nums">{fmt(summary.totalNonVehicleExpenses)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Vehicle deduction</span>
                  <span className="font-semibold text-gray-700 tabular-nums">{fmt(summary.vehicle.chosenAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-200">
                  <span className="font-semibold text-gray-700">Total allowable expenses</span>
                  <span className="font-bold text-red-600 tabular-nums">{fmt(summary.totalAllowableExpenses)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Turnover</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmt(summary.turnover)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                  <span className="text-base font-bold text-gray-900">
                    {summary.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                  </span>
                  <span className={`text-xl font-bold tabular-nums ${summary.netProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                    {summary.netProfit < 0 ? '−' : ''}{fmt(summary.netProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Tax Liability ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Tax Liability Estimate</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Income tax + Class 4 NI · {summary.taxYear}</p>
                </div>
                {/* Other income input */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Other annual income:</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={otherIncomeInput}
                      onChange={(e) => setOtherIncomeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyOtherIncome()}
                      className="w-28 pl-6 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <button
                    onClick={handleApplyOtherIncome}
                    disabled={!otherIncomeInput.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Recalculate
                  </button>
                  {appliedOtherIncome !== undefined && (
                    <button onClick={handleClearOtherIncome} className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {summary.liability.netProfit <= 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-gray-500">No tax liability — net profit is zero or a loss.</p>
                </div>
              ) : (
                <>
                  {/* Income basis */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Income basis</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Self-employment profit</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(summary.liability.netProfit)}</span>
                      </div>
                      {summary.liability.otherIncome > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Other income</span>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(summary.liability.otherIncome)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Personal allowance</span>
                        <span className="text-gray-500 tabular-nums">({fmt(summary.liability.effectivePersonalAllowance)})</span>
                      </div>
                      {summary.liability.effectivePersonalAllowance < summary.liability.personalAllowance && (
                        <p className="text-xs text-amber-600">Personal allowance tapered — income exceeds £100,000</p>
                      )}
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                        <span className="font-semibold text-gray-700">Taxable income</span>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.taxableIncome)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Income tax */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Income Tax</p>
                    <div className="space-y-1.5">
                      {summary.liability.incomeTaxBands.map((band) => (
                        <div key={band.label} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">{band.label}</span>
                            <span className="text-xs text-gray-400">on {fmt(band.taxableAmount)}</span>
                          </div>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(band.taxDue)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                        <span className="font-semibold text-gray-700">Income tax subtotal</span>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.totalIncomeTax)}</span>
                      </div>
                    </div>
                  </div>

                  {/* National Insurance */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">National Insurance</p>
                    <div className="space-y-1.5">
                      {summary.liability.niClass4Lower > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Class 4 (6%) — profits £12,570–£50,270</span>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(summary.liability.niClass4Lower)}</span>
                        </div>
                      )}
                      {summary.liability.niClass4Upper > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Class 4 (2%) — profits above £50,270</span>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(summary.liability.niClass4Upper)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <div>
                          <span className="text-gray-600">Class 2</span>
                          {summary.liability.niClass2Secured ? (
                            <span className="ml-2 text-xs text-emerald-600">State pension credit secured ✓</span>
                          ) : (
                            <span className="ml-2 text-xs text-amber-600">Below threshold — voluntary payment may apply</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums">
                          {summary.liability.niClass2Secured
                            ? `£${summary.liability.niClass2Annual.toFixed(2)} voluntary`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                        <span className="font-semibold text-gray-700">NI subtotal</span>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.totalNiClass4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Total liability */}
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-900">Total estimated tax liability</span>
                      <span className="text-xl font-bold text-red-600 tabular-nums">{fmt(summary.liability.totalLiability)}</span>
                    </div>
                  </div>

                  {/* Payment schedule */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Schedule</p>
                    {summary.liability.requiresPaymentOnAccount ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-start text-sm">
                          <div>
                            <span className="text-gray-700 font-medium">{formatDate(summary.liability.januaryDate)}</span>
                            <p className="text-xs text-gray-400 mt-0.5">Filing deadline + 1st payment on account</p>
                          </div>
                          <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.januaryPayment)}</span>
                        </div>
                        <div className="flex justify-between items-start text-sm">
                          <div>
                            <span className="text-gray-700 font-medium">{formatDate(summary.liability.julyDate)}</span>
                            <p className="text-xs text-gray-400 mt-0.5">2nd payment on account</p>
                          </div>
                          <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.julyPayment)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start text-sm">
                        <div>
                          <span className="text-gray-700 font-medium">{formatDate(summary.liability.januaryDate)}</span>
                          <p className="text-xs text-gray-400 mt-0.5">Full amount due — no payment on account required (liability below £1,000)</p>
                        </div>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.januaryPayment)}</span>
                      </div>
                    )}
                  </div>

                  {/* Take-home */}
                  <div className="px-6 py-4 bg-gray-50/60">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">After-tax take-home</p>
                        <p className={`text-xl font-bold tabular-nums ${summary.liability.afterTaxProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {summary.liability.afterTaxProfit < 0 ? '−' : ''}{fmt(summary.liability.afterTaxProfit)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Self-employment profit after tax and NI</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">Effective tax rate</p>
                        <p className="text-xl font-bold text-gray-800 tabular-nums">
                          {summary.liability.effectiveTaxRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Of net self-employment profit</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── SA103 Draft ── */}
            {(() => {
              if (!selectedClient) return null
              const draft: SA103Draft = buildSA103Draft(
                summary,
                selectedClient,
                getTaxYearConfig(taxYear),
              )

              const flagColors: Record<string, string> = {
                action:  'bg-red-50 border-red-200 text-red-700',
                warning: 'bg-amber-50 border-amber-200 text-amber-700',
                info:    'bg-blue-50 border-blue-200 text-blue-700',
              }
              const flagIcons: Record<string, string> = {
                action: '⚠', warning: '⚠', info: 'ℹ',
              }

              return (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-gray-900">SA103 Draft Summary</h2>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide ${
                          draft.hasBlockingFlags
                            ? 'bg-red-100 text-red-600'
                            : 'bg-amber-100 text-amber-600'
                        }`}>DRAFT</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {draft.formVersion}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {draft.clientName}
                        {draft.utr ? ` · UTR: ${draft.utr}` : ' · UTR not recorded'}
                        {' · '}{draft.businessDescription}
                        {' · '}Generated {draft.generatedDate}
                      </p>
                    </div>
                    {draft.hasBlockingFlags && (
                      <span className="text-xs font-medium text-red-600">
                        Action required before filing
                      </span>
                    )}
                  </div>

                  {/* Business income */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Business Income</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Turnover from self-employment</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(draft.turnover)}</span>
                      </div>
                      {draft.otherBusinessIncome > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Other business income</span>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(draft.otherBusinessIncome)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                        <span className="font-semibold text-gray-700">Total business income</span>
                        <span className="font-bold text-emerald-700 tabular-nums">{fmt(draft.totalBusinessIncome)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Allowable expenses */}
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Allowable Expenses
                      {draft.formVersion === 'SA103S' && (
                        <span className="ml-2 normal-case font-normal text-gray-400">
                          (SA103S — shown in detail for review, filed as total)
                        </span>
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {draft.expenseLines.map((line) => (
                        <div key={line.hmrcLabel} className="flex justify-between text-sm">
                          <span className="text-gray-600">{line.hmrcLabel}</span>
                          <span className="font-semibold text-gray-800 tabular-nums">{fmt(line.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm">
                        <div>
                          <span className="text-gray-600">{draft.vehicleLine.hmrcLabel}</span>
                          <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            draft.vehicleLine.method === 'mileage'
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {draft.vehicleLine.method === 'mileage' ? 'mileage method' : 'actual costs'}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(draft.vehicleLine.amount)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                        <span className="font-semibold text-gray-700">Total allowable expenses</span>
                        <span className="font-bold text-red-600 tabular-nums">{fmt(draft.totalAllowableExpenses)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Profit */}
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/40">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Profit / Loss</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 font-medium">
                          {draft.isLoss ? 'Net loss' : 'Net profit'}
                        </span>
                        <span className={`font-bold text-lg tabular-nums ${draft.isLoss ? 'text-red-600' : 'text-indigo-700'}`}>
                          {draft.isLoss ? '−' : ''}{fmt(draft.netProfit)}
                        </span>
                      </div>
                      {!draft.isLoss && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Taxable profit carried to SA100</span>
                          <span className="font-semibold text-gray-700 tabular-nums">{fmt(draft.taxableProfitForSA100)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Accountant flags */}
                  <div className="px-6 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Accountant Notes</p>
                    <div className="space-y-2">
                      {draft.flags.map((flag, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${flagColors[flag.severity]}`}
                        >
                          <span className="flex-none font-bold mt-0.5">{flagIcons[flag.severity]}</span>
                          <div>
                            <span className="font-semibold">{flag.label}: </span>
                            {flag.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

            <p className="text-xs text-gray-400 text-center pb-4">
              Tax year {summary.taxYear} · 6 April – 5 April · approved transactions only
              {summary.flaggedTransactionCount > 0 && (
                <> · <span className="text-amber-500">{summary.flaggedTransactionCount} flagged transaction{summary.flaggedTransactionCount !== 1 ? 's' : ''} excluded</span></>
              )}
            </p>
          </>
        )}
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Navigation ──
  const [currentView,   setCurrentView]   = useState<View>('dashboard')
  const [viewingClient, setViewingClient] = useState<ClientRecord | null>(null)

  // ── Client selector (dashboard topbar) ──
  const [allClients,       setAllClients]       = useState<ClientRecord[]>([])
  const [selectedClient,   setSelectedClient]   = useState<ClientRecord | null>(null)
  const [showCreateClient, setShowCreateClient] = useState(false)

  // ── Dashboard run state ──
  const [transactions,      setTransactions]      = useState<DashboardTransaction[]>([])
  const [isProcessing,      setIsProcessing]      = useState(false)
  const [selected,          setSelected]          = useState<DashboardTransaction | null>(null)
  const [merchantMemory,    setMerchantMemory]    = useState<MerchantMemory>(new Map())
  const [bankFiles,         setBankFiles]         = useState<File[]>([])
  const [platformFiles,     setPlatformFiles]     = useState<File[]>([])
  const [receiptFiles,      setReceiptFiles]      = useState<File[]>([])
  const [error,             setError]             = useState<string | null>(null)
  const [parseWarnings,     setParseWarnings]     = useState<string[]>([])
  const [unmatchedPayouts,  setUnmatchedPayouts]  = useState<UnmatchedPayout[]>([])
  const [unmatchedReceipts, setUnmatchedReceipts] = useState<UnmatchedReceipt[]>([])
  const [isBulkSaving,      setIsBulkSaving]      = useState(false)

  // businessType is always derived from the selected client
  const businessType: BusinessType = selectedClient?.business_type ?? 'taxi'

  // Load all clients on mount
  useEffect(() => {
    getClients().then(setAllClients)
  }, [])

  // Reload merchant memory whenever the selected client changes
  useEffect(() => {
    if (!selectedClient) { setMerchantMemory(new Map()); return }
    loadConfirmedRules(selectedClient.business_type).then((rules) => {
      if (rules.length === 0) { setMerchantMemory(new Map()); return }
      setMerchantMemory(
        new Map(rules.map((r) => [r.pattern, { category: r.category, pattern: r.pattern }])),
      )
    })
  }, [selectedClient?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──

  function handleNavigate(view: View) {
    setCurrentView(view)
    if (view !== 'client-detail') setViewingClient(null)
  }

  function handleViewClient(client: ClientRecord) {
    setViewingClient(client)
    setCurrentView('client-detail')
  }

  async function handleProcess() {
    if (bankFiles.length === 0) return
    if (!selectedClient) {
      setError('Please select a client before running')
      return
    }

    setIsProcessing(true)
    setError(null)
    setParseWarnings([])
    setUnmatchedPayouts([])
    setUnmatchedReceipts([])

    try {
      // 1. Parse all bank CSVs and concatenate
      const allWarnings: string[] = []
      const parsed: import('@/types/transaction').Transaction[] = []
      for (const file of bankFiles) {
        const text = await file.text()
        const { transactions, warnings } = parseMonzoCSV(text)
        parsed.push(...transactions)
        allWarnings.push(...warnings)
      }
      if (allWarnings.length > 0) setParseWarnings(allWarnings)

      // 2. Categorise
      const rows = await processTransactions(parsed, businessType)

      // 3. Platform matching — parse all platform CSVs and concatenate
      type MatchInfo = { matchSource: 'platform' | 'unmatched'; matchedRow?: UberWeeklyRow }
      const matchMap = new Map<number, MatchInfo>()
      let newUnmatched: UnmatchedPayout[] = []

      if (platformFiles.length > 0) {
        const allUberRows: UberWeeklyRow[] = []
        for (const file of platformFiles) {
          const text = await file.text()
          const { rows: uberRows, warnings: uberWarnings } = parseUberCSV(text)
          allUberRows.push(...uberRows)
          if (uberWarnings.length > 0) setParseWarnings((w) => [...w, ...uberWarnings])
        }
        const { transactions: annotated, unmatchedPayouts: unmatched } =
          matchPlatformPayouts(allUberRows, parsed)
        newUnmatched = unmatched
        annotated.forEach((a, i) =>
          matchMap.set(i, { matchSource: a.matchSource, matchedRow: a.matchedRow }),
        )
      }

      // 4. Receipt OCR + matching (if receipts uploaded)
      const receiptMap = new Map<number, { matchedReceipt: ExtractedReceipt; matchSource: 'receipt' | 'receipt-uncertain' }>()
      let newUnmatchedReceipts: UnmatchedReceipt[] = []

      if (receiptFiles.length > 0) {
        const MAX_FILE_SIZE   = 10 * 1024 * 1024
        const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        const CONCURRENCY     = 3

        const validFiles: File[]             = []
        const validationWarnings: string[]   = []
        for (const file of receiptFiles) {
          if (!SUPPORTED_TYPES.includes(file.type)) {
            validationWarnings.push(`Receipt "${file.name}" skipped — unsupported type ${file.type}`)
          } else if (file.size > MAX_FILE_SIZE) {
            validationWarnings.push(`Receipt "${file.name}" skipped — file too large (max 10 MB)`)
          } else {
            validFiles.push(file)
          }
        }
        if (validationWarnings.length > 0) setParseWarnings((w) => [...w, ...validationWarnings])

        const toBase64 = async (file: File): Promise<string> => {
          const buffer = await file.arrayBuffer()
          const bytes  = new Uint8Array(buffer)
          const CHUNK  = 8192
          let result   = ''
          for (let i = 0; i < bytes.length; i += CHUNK) {
            result += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
          }
          return btoa(result)
        }

        const encoded = await Promise.all(
          validFiles.map(async (file) => ({
            base64:    await toBase64(file),
            mediaType: file.type,
            fileName:  file.name,
          })),
        )

        const allExtracted: ExtractedReceipt[] = []
        const allFailed: Array<{ fileName: string; reason: string }> = []
        for (let i = 0; i < encoded.length; i += CONCURRENCY) {
          const batch = encoded.slice(i, i + CONCURRENCY)
          const { receipts: extracted, failed } = await ocrReceipts(batch)
          allExtracted.push(...extracted)
          allFailed.push(...failed)
        }

        if (allFailed.length > 0) {
          setParseWarnings((w) => [
            ...w,
            ...allFailed.map((f) => `Receipt "${f.fileName}" skipped — ${f.reason}`),
          ])
        }
        if (allExtracted.length > 0) {
          const { transactions: receiptAnnotated, unmatchedReceipts: unmatched } =
            matchReceiptTransactions(allExtracted, parsed)
          newUnmatchedReceipts = unmatched
          receiptAnnotated.forEach((a, i) => {
            if ((a.matchSource === 'receipt' || a.matchSource === 'receipt-uncertain') && a.matchedReceipt) {
              receiptMap.set(i, { matchedReceipt: a.matchedReceipt, matchSource: a.matchSource })
            }
          })
        }
      }

      // 5. Merge categorisation + platform + receipt results
      const mapped: DashboardTransaction[] = rows.map((r, i) => {
        const platformMatch = matchMap.get(i)
        const receiptMatch  = receiptMap.get(i)
        const matchSource: MatchSource = platformMatch?.matchSource === 'platform'
          ? 'platform'
          : receiptMatch
          ? receiptMatch.matchSource
          : 'unmatched'
        return {
          id: String(i),
          date:           r.date,
          description:    r.description,
          merchant:       r.merchant ?? r.description,
          amount:         r.amount,
          category:       r.category,
          confidence:     r.confidence,
          source:         r.source,
          reasoning:      r.reasoning ?? '',
          matchSource,
          matchedRow:     platformMatch?.matchedRow,
          matchedReceipt: receiptMatch?.matchedReceipt,
          status:         r.confidence >= 80 ? 'approved' : 'flagged',
          reviewReason:   r.confidence < 80 ? 'Low confidence — please review' : undefined,
          matchedPattern: r.matchedPattern,
        }
      })

      setTransactions(applyMemory(mapped, merchantMemory))
      setUnmatchedPayouts(newUnmatched)
      setUnmatchedReceipts(newUnmatchedReceipts)

      // 6. Persist to Supabase under the selected client
      try {
        await saveRunTransactions(
          selectedClient.id,
          mapped.map((t) => ({
            date:           t.date,
            amount:         t.amount,
            merchant:       t.merchant || null,
            description:    t.description,
            category:       t.category,
            confidence:     t.confidence,
            reasoning:      t.reasoning,
            source:         t.source,
            matchSource:    t.matchSource,
            matchedPattern: t.matchedPattern ?? null,
            reviewReason:   t.reviewReason ?? null,
          })),
        )
      } catch (saveErr) {
        setError(`Categorisation complete but results could not be saved: ${(saveErr as Error).message}`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }

  function handleDownload() {
    const exportRows: ExportRow[] = [
      ...transactions.map((t) => ({
        date:        t.date,
        description: t.merchant || t.description,
        amount:      t.amount,
        category:    t.category,
        matchedTo:   t.matchedRow?.sourceLabel ?? 'Unmatched',
        confidence:  t.confidence,
      })),
      ...unmatchedPayouts.map((u) => ({
        date:        u.row.payoutDate,
        description: u.row.sourceLabel,
        amount:      u.row.netEarnings,
        category:    'income' as const,
        matchedTo:   `WARNING: ${u.reason}`,
        confidence:  0,
      })),
    ]

    const csv  = serialiseToCsv(exportRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleApprove(id: string) {
    const tx = transactions.find((t) => t.id === id)
    if (!tx) return

    const pattern = tx.matchedPattern ?? tx.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase()

    setTransactions((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: 'approved' as const, reviewReason: undefined } : t),
    )
    setMerchantMemory((m) => new Map(m).set(pattern, { category: tx.category, pattern }))

    try {
      await confirmTransaction(pattern, tx.category, businessType)
    } catch {
      setTransactions((prev) =>
        prev.map((t) => t.id === id ? { ...t, status: tx.status, reviewReason: tx.reviewReason } : t),
      )
      setError('Failed to save rule — please try again.')
    }
  }

  async function handleBulkApprove(eligible: DashboardTransaction[]) {
    if (eligible.length === 0) return
    setIsBulkSaving(true)
    setError(null)

    const rules = eligible.map((t) => ({
      pattern:  t.matchedPattern ?? t.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase(),
      category: t.category,
    }))

    try {
      await bulkConfirmTransactions(rules, businessType)

      const patternSet = new Set(rules.map((r) => r.pattern))
      setTransactions((prev) =>
        prev.map((t) => {
          const pattern = t.matchedPattern ?? t.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase()
          if (!patternSet.has(pattern)) return t
          return { ...t, status: 'approved' as const, reviewReason: undefined }
        }),
      )
      setMerchantMemory((m) => {
        const next = new Map(m)
        rules.forEach((r) => next.set(r.pattern, { category: r.category, pattern: r.pattern }))
        return next
      })
    } catch (err) {
      setError(`Bulk save failed — ${(err as Error).message}`)
    } finally {
      setIsBulkSaving(false)
    }
  }

  function handleRecategorise(id: string) {
    console.log('Recategorise:', id)
  }

  // ── Render ──

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />

      <main className="flex-1 overflow-y-auto">

        {/* ── Dashboard view ── */}
        {currentView === 'dashboard' && (
          <>
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
                  <p className="text-xs text-gray-400 mt-0.5">Tax year 2025–26</p>
                </div>

                {/* Client selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedClient?.id ?? ''}
                    onChange={(e) => {
                      const client = allClients.find((c) => c.id === e.target.value) ?? null
                      setSelectedClient(client)
                      setTransactions([])
                      setMerchantMemory(new Map())
                    }}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">Select client…</option>
                    {allClients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowCreateClient(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>

                {selectedClient && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">
                    {BUSINESS_TYPE_LABELS[selectedClient.business_type]}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {merchantMemory.size > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600">
                    <BrainIcon className="w-3 h-3" />
                    {merchantMemory.size} rule{merchantMemory.size !== 1 ? 's' : ''} saved
                  </span>
                )}
                {transactions.length > 0 && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    <UploadIcon className="w-3.5 h-3.5 rotate-180" />
                    Download CSV
                  </button>
                )}
                <span className="text-xs text-gray-400">29 Mar 2026</span>
                <div className="w-px h-4 bg-gray-200" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                  Beta
                </span>
              </div>
            </div>

            <div className="px-8 py-6 space-y-5 max-w-7xl">
              <UploadPanel
                onProcess={handleProcess}
                isProcessing={isProcessing}
                bankStatements={bankFiles}
                onBankStatementsChange={setBankFiles}
                platformStatements={platformFiles}
                onPlatformStatementsChange={setPlatformFiles}
                receipts={receiptFiles}
                onReceiptsChange={setReceiptFiles}
              />

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertIcon className="w-4 h-4 text-red-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">Failed to process</p>
                    <p className="mt-0.5 text-red-600">{error}</p>
                  </div>
                </div>
              )}

              {unmatchedReceipts.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {unmatchedReceipts.length} receipt{unmatchedReceipts.length !== 1 ? 's' : ''} not found in bank statement
                    </p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {unmatchedReceipts.map((u, i) => (
                        <li key={i}>{u.receipt.fileName} — {u.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {unmatchedPayouts.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {unmatchedPayouts.length} Uber payout{unmatchedPayouts.length !== 1 ? 's' : ''} not found in bank statement
                    </p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {unmatchedPayouts.map((u, i) => (
                        <li key={i}>{u.row.sourceLabel} — {u.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {parseWarnings.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">{parseWarnings.length} row{parseWarnings.length !== 1 ? 's' : ''} skipped during import</p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {parseWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              <SummaryCards transactions={transactions} />
              {transactions.length > 0 && (
                <BulkApproveBar
                  transactions={transactions}
                  onApprove={handleBulkApprove}
                  isSaving={isBulkSaving}
                />
              )}
              <TransactionsTable transactions={transactions} onSelect={setSelected} />
            </div>
          </>
        )}

        {/* ── Clients view ── */}
        {currentView === 'clients' && (
          <ClientsView
            onViewClient={handleViewClient}
            onNewClient={(client) => setAllClients((prev) => [client, ...prev])}
          />
        )}

        {/* ── Client detail view ── */}
        {currentView === 'client-detail' && viewingClient && (
          <ClientDetailView
            client={viewingClient}
            onBack={() => setCurrentView('clients')}
          />
        )}

        {/* ── Tax summary view ── */}
        {currentView === 'tax' && (
          <TaxView
            selectedClient={selectedClient}
            allClients={allClients}
            onSelectClient={(c) => {
              setSelectedClient(c)
              setTransactions([])
              setMerchantMemory(new Map())
            }}
          />
        )}

      </main>

      {selected && currentView === 'dashboard' && (
        <DetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onRecategorise={handleRecategorise}
        />
      )}

      {showCreateClient && (
        <CreateClientModal
          onClose={() => setShowCreateClient(false)}
          onCreated={(client) => {
            setAllClients((prev) => [client, ...prev])
            setSelectedClient(client)
            setTransactions([])
            setMerchantMemory(new Map())
            setShowCreateClient(false)
          }}
        />
      )}
    </div>
  )
}
