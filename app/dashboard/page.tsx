'use client'

import { useState, useRef } from 'react'
import { type TransactionCategory } from '@/types/transaction'
import { confirmTransaction } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchSource = 'receipt' | 'platform' | 'unmatched'

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
}

/** Merchant memory: merchant (lowercase) → { category, pattern } */
type MerchantMemory = Map<string, { category: TransactionCategory; pattern: string }>

// ─── Mock data ────────────────────────────────────────────────────────────────

const DEMO_TRANSACTIONS: DashboardTransaction[] = [
  {
    id: '1', date: '2026-03-01',
    description: 'HALFORDS AUTO CENTRES STRATFORD 87.49 01MAR',
    merchant: 'Halfords', amount: -87.49,
    category: 'materials', confidence: 95, source: 'ai',
    matchedPattern: '\\bHALFORDS\\b',
    reasoning: 'The full description confirms Halfords Auto Centres — a UK automotive parts retailer. Amount and description are consistent with consumables or parts for mechanic work.',
    matchSource: 'receipt', status: 'approved',
  },
  {
    id: '2', date: '2026-03-03',
    description: 'SHELL 8327 ROMFORD DIESEL 094.20 03MAR',
    merchant: 'Shell', amount: -94.20,
    category: 'fuel', confidence: 99, source: 'rules',
    matchedPattern: 'SHELL.*DIESEL',
    reasoning: '"SHELL … DIESEL" in the description unambiguously identifies a diesel fuel purchase at a Shell station. Matched by stored rule SHELL.*DIESEL.',
    matchSource: 'receipt', status: 'approved',
  },
  {
    id: '3', date: '2026-03-04',
    description: 'DIRECT LINE INSURANCE ANNUAL PREM DD 1240.00',
    merchant: 'Direct Line', amount: -1240.00,
    category: 'insurance', confidence: 96, source: 'rules',
    matchedPattern: 'DIRECT\\s+LINE.*INSURANCE',
    reasoning: '"DIRECT LINE INSURANCE ANNUAL PREM DD" clearly indicates an insurance direct debit. Matched by rule DIRECT\\s+LINE.*INSURANCE.',
    matchSource: 'unmatched', status: 'approved',
  },
  {
    id: '4', date: '2026-03-05',
    description: 'SNAP-ON TOOLS LTD KEIGHLEY 319.99 05MAR',
    merchant: 'Snap-on Tools', amount: -319.99,
    category: 'tools', confidence: 97, source: 'ai',
    matchedPattern: 'SNAP-ON TOOLS',
    reasoning: '"SNAP-ON TOOLS LTD" in the description confirms a professional tools purchase. Snap-on is exclusively used in the motor trade.',
    matchSource: 'receipt', status: 'approved',
  },
  {
    id: '5', date: '2026-03-07',
    description: 'EURO CAR PARTS LTD ROMFORD 152.30 07MAR',
    merchant: 'Euro Car Parts', amount: -152.30,
    category: 'materials', confidence: 94, source: 'rules',
    matchedPattern: 'EURO CAR PARTS',
    reasoning: '"EURO CAR PARTS LTD" is a UK automotive parts wholesaler. Parts are consumables used directly on customer jobs.',
    matchSource: 'unmatched', status: 'approved',
  },
  {
    id: '6', date: '2026-03-10',
    description: 'DVLA VEHICLE TAX VRN AB12CDE 299.00 10MAR',
    merchant: 'DVLA Vehicle Tax', amount: -299.00,
    category: 'other', confidence: 95, source: 'hardcoded',
    matchedPattern: '\\bdvla\\b',
    reasoning: 'DVLA vehicle road tax is classified as "other" by a built-in rule. The VRN confirms this is a vehicle tax payment — a necessary business cost that does not fit standard HMRC trade categories.',
    matchSource: 'unmatched', status: 'approved',
  },
  {
    id: '7', date: '2026-03-12',
    description: 'BP CONNECT CHADWELL HEATH 78.60 12MAR',
    merchant: 'BP', amount: -78.60,
    category: 'fuel', confidence: 99, source: 'rules',
    matchedPattern: '\\bBP\\b.*CONNECT',
    reasoning: '"BP CONNECT" is a BP fuel station format. Amount and description are consistent with a standard fuel fill-up.',
    matchSource: 'receipt', status: 'approved',
  },
  {
    id: '8', date: '2026-03-14',
    description: 'GARAGESOFT PRO MONTHLY SUBSCRIPTION 29.99 14MAR',
    merchant: 'GarageSoft Pro', amount: -29.99,
    category: 'software', confidence: 65, source: 'ai',
    matchedPattern: 'GARAGESOFT',
    reasoning: '"GARAGESOFT PRO MONTHLY SUBSCRIPTION" indicates a SaaS product for garage management. No prior rule and no receipt found to confirm.',
    matchSource: 'unmatched', status: 'flagged',
    reviewReason: 'No receipt found',
  },
  {
    id: '9', date: '2026-03-18',
    description: 'AUTOSPARKS ELECTRICAL LTD INVOICE 3847 450.00',
    merchant: 'AutoSparks Electrical', amount: -450.00,
    category: 'subcontractor', confidence: 68, source: 'ai',
    matchedPattern: 'AUTOSPARKS ELECTRICAL',
    reasoning: '"AUTOSPARKS ELECTRICAL LTD INVOICE" suggests a subcontracted auto-electrician, but could also be a parts supplier. No prior history — manual confirmation needed.',
    matchSource: 'platform', status: 'flagged',
    reviewReason: 'New merchant – no history',
  },
  {
    id: '10', date: '2026-03-20',
    description: 'BACS DAVIES AUTOS FORD FOCUS SERVICE JOB 320.00',
    merchant: 'Customer Payment', amount: 320.00,
    category: 'income', confidence: 99, source: 'ai',
    matchedPattern: 'BACS.*SERVICE JOB|BACS.*DAVIES AUTOS',
    reasoning: '"BACS DAVIES AUTOS … SERVICE JOB" is a BACS payment received for a completed service. The full description makes this unambiguously income.',
    matchSource: 'receipt', status: 'approved',
  },
]

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
  receipt:   { label: 'Matched to receipt',  className: 'bg-emerald-100 text-emerald-700' },
  platform:  { label: 'Matched to platform', className: 'bg-blue-100 text-blue-700'     },
  unmatched: { label: 'Unmatched',           className: 'bg-gray-100 text-gray-500'     },
}

const SOURCE_CONFIG: Record<DashboardTransaction['source'], { label: string; className: string }> = {
  ai:         { label: 'AI classified',   className: 'bg-purple-100 text-purple-700' },
  rules:      { label: 'Cached rule',     className: 'bg-indigo-100 text-indigo-700' },
  hardcoded:  { label: 'Built-in rule',   className: 'bg-slate-100 text-slate-600'  },
  memory:     { label: 'Confirmed',       className: 'bg-emerald-100 text-emerald-700' },
}

const NAV_ITEMS = [
  { label: 'Dashboard',    icon: GridIcon,    active: true  },
  { label: 'Clients',      icon: UsersIcon,   active: false },
  { label: 'Transactions', icon: ListIcon,    active: false },
  { label: 'Receipts',     icon: ReceiptIcon, active: false },
  { label: 'Settings',     icon: SettingsIcon, active: false },
]

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

/** Apply merchant memory to the base demo transactions */
function applyMemory(
  base: DashboardTransaction[],
  memory: MerchantMemory,
): DashboardTransaction[] {
  return base.map((t) => {
    const remembered = memory.get(t.merchant.toLowerCase())
    if (!remembered) return t
    return {
      ...t,
      category: remembered.category,
      confidence: 99,
      source: 'memory' as const,
      status: 'approved' as const,
      reviewReason: undefined,
      matchedPattern: remembered.pattern,
    }
  })
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
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
        {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
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

interface UploadedFiles {
  bankStatement: File | null
  receipts: File[]
  platformStatement: File | null
}

function UploadPanel({
  onProcess,
  isProcessing,
}: {
  onProcess: () => void
  isProcessing: boolean
}) {
  const [files, setFiles] = useState<UploadedFiles>({
    bankStatement: null, receipts: [], platformStatement: null,
  })

  const bankRef = useRef<HTMLInputElement>(null)
  const receiptsRef = useRef<HTMLInputElement>(null)
  const platformRef = useRef<HTMLInputElement>(null)

  const hasAnyFile = files.bankStatement || files.receipts.length > 0 || files.platformStatement

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Import Data</h2>
      <div className="grid grid-cols-3 gap-4">
        <UploadZone
          label="Bank Statement" description="CSV export from your bank" accept=".csv"
          file={files.bankStatement} inputRef={bankRef}
          onSelect={(f) => setFiles((p) => ({ ...p, bankStatement: f[0] ?? null }))}
          onClear={() => setFiles((p) => ({ ...p, bankStatement: null }))}
        />
        <UploadZone
          label="Receipts" description="JPG, PNG or PDF images" accept="image/*,.pdf" multiple
          file={files.receipts.length > 0 ? ({ name: `${files.receipts.length} file${files.receipts.length !== 1 ? 's' : ''} selected` } as File) : null}
          inputRef={receiptsRef}
          onSelect={(f) => setFiles((p) => ({ ...p, receipts: [...p.receipts, ...Array.from(f)] }))}
          onClear={() => setFiles((p) => ({ ...p, receipts: [] }))}
        />
        <UploadZone
          label="Platform Statement" description="Uber, Checkatrade CSV" accept=".csv"
          file={files.platformStatement} inputRef={platformRef}
          onSelect={(f) => setFiles((p) => ({ ...p, platformStatement: f[0] ?? null }))}
          onClear={() => setFiles((p) => ({ ...p, platformStatement: null }))}
        />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {hasAnyFile ? 'Ready to process' : 'Upload at least one file to continue'}
        </p>
        <button
          onClick={onProcess}
          disabled={isProcessing}
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
  label, description, accept, multiple, file, inputRef, onSelect, onClear,
}: {
  label: string; description: string; accept: string; multiple?: boolean
  file: File | null; inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (files: FileList) => void; onClear: () => void
}) {
  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={(e) => e.target.files && onSelect(e.target.files)} />
      {file ? (
        <div className="h-[90px] flex items-center gap-3 px-4 border-2 border-indigo-300 bg-indigo-50 rounded-lg">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-none">
            <CheckIcon className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-indigo-700 truncate">{file.name}</p>
            <p className="text-xs text-indigo-400 mt-0.5">{label}</p>
          </div>
          <button onClick={onClear} className="flex-none text-indigo-400 hover:text-indigo-600 cursor-pointer">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-[90px] flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 rounded-lg transition-colors cursor-pointer group"
        >
          <UploadIcon className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition-colors" />
          <p className="text-xs font-medium text-gray-500 group-hover:text-indigo-600 transition-colors">{label}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </button>
      )}
    </div>
  )
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ transactions }: { transactions: DashboardTransaction[] }) {
  const income    = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses  = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const approved  = transactions.filter((t) => t.status === 'approved').length
  const flagged   = transactions.filter((t) => t.status === 'flagged').length

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
      dot: flagged > 0 ? 'bg-amber-500' : 'bg-gray-300' },
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
        {/* Header */}
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

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Review reason banner */}
          {transaction.reviewReason && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertIcon className="w-4 h-4 text-amber-500 flex-none" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Flagged for review</p>
                <p className="text-xs text-amber-600 mt-0.5">{transaction.reviewReason}</p>
              </div>
            </div>
          )}

          {/* Category + classification source */}
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

          {/* Confidence */}
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

          {/* AI Reasoning */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <BrainIcon className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-400">AI Reasoning</p>
            </div>
            <blockquote className="text-sm text-gray-700 leading-relaxed bg-gray-50 border-l-4 border-indigo-300 px-4 py-3 rounded-r-lg italic">
              {transaction.reasoning}
            </blockquote>
          </div>

          {/* Match source */}
          <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <ReceiptIcon className="w-4 h-4 text-gray-400" />
              <p className="text-sm text-gray-600">Evidence match</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${match.className}`}>
              {match.label}
            </span>
          </div>
        </div>

        {/* Actions */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [selected, setSelected] = useState<DashboardTransaction | null>(null)
  const [merchantMemory, setMerchantMemory] = useState<MerchantMemory>(new Map())

  function handleProcess() {
    setIsProcessing(true)
    setTimeout(() => {
      setTransactions(applyMemory(DEMO_TRANSACTIONS, merchantMemory))
      setIsProcessing(false)
    }, 1800)
  }

  function handleApprove(id: string) {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        // Use the engine's matched pattern; fall back to escaped merchant name
        const pattern = t.matchedPattern ?? t.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase()
        // Save to merchant memory so re-processing picks it up at 99%
        setMerchantMemory((m) => new Map(m).set(t.merchant.toLowerCase(), { category: t.category, pattern }))
        // Fire-and-forget: persist to Supabase via server action
        confirmTransaction(pattern, t.category, 'mechanic').catch(console.warn)
        return { ...t, status: 'approved' as const, reviewReason: undefined }
      }),
    )
  }

  function handleRecategorise(id: string) {
    // Placeholder — would open a category picker
    console.log('Recategorise:', id)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        {/* Topbar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">Tax year 2025–26 · Mechanic</p>
          </div>
          <div className="flex items-center gap-2">
            {merchantMemory.size > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600">
                <BrainIcon className="w-3 h-3" />
                {merchantMemory.size} merchant{merchantMemory.size !== 1 ? 's' : ''} remembered
              </span>
            )}
            <span className="text-xs text-gray-400">29 Mar 2026</span>
            <div className="w-px h-4 bg-gray-200" />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
              Beta
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-5 max-w-7xl">
          <UploadPanel onProcess={handleProcess} isProcessing={isProcessing} />
          <SummaryCards transactions={transactions} />
          <TransactionsTable transactions={transactions} onSelect={setSelected} />
        </div>
      </main>

      {selected && (
        <DetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onRecategorise={handleRecategorise}
        />
      )}
    </div>
  )
}
