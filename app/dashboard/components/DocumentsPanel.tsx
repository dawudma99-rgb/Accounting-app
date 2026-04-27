'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { saveDocumentRecord, getClientDocuments, markDocumentReviewed } from '../actions'
import type { ClientDocument } from '../actions'
import { CheckIcon, SpinnerIcon, XIcon, AlertIcon } from './icons'

// ─── Config ───────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'fuel', 'materials', 'tools', 'insurance', 'software',
  'subcontractor', 'vehicle_purchase', 'other',
] as const

const COMPLIANCE_CATEGORIES = [
  'sa302', 'aml', 'loe', 'hmrc_correspondence',
  'mileage_log', 'bank_statement', 'platform_statement', 'income',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  fuel:                 'Fuel receipt',
  materials:            'Materials receipt',
  tools:                'Tools / equipment receipt',
  insurance:            'Insurance document',
  software:             'Software / subscription receipt',
  subcontractor:        'Subcontractor invoice',
  vehicle_purchase:     'Vehicle purchase invoice',
  other:                'Other expense receipt',
  sa302:                'SA302',
  aml:                  'AML evidence',
  loe:                  'Letter of Engagement',
  hmrc_correspondence:  'HMRC correspondence',
  mileage_log:          'Mileage log',
  bank_statement:       'Bank statement',
  platform_statement:   'Platform statement',
  income:               'Income evidence',
}

const CATEGORY_BADGES: Record<string, string> = {
  fuel:                'bg-orange-100 text-orange-700',
  materials:           'bg-yellow-100 text-yellow-700',
  tools:               'bg-yellow-100 text-yellow-700',
  insurance:           'bg-blue-100 text-blue-700',
  software:            'bg-indigo-100 text-indigo-700',
  subcontractor:       'bg-purple-100 text-purple-700',
  vehicle_purchase:    'bg-pink-100 text-pink-700',
  other:               'bg-zinc-100 text-zinc-700',
  sa302:               'bg-slate-100 text-slate-700',
  aml:                 'bg-red-100 text-red-700',
  loe:                 'bg-emerald-100 text-emerald-700',
  hmrc_correspondence: 'bg-slate-100 text-slate-700',
  mileage_log:         'bg-cyan-100 text-cyan-700',
  bank_statement:      'bg-zinc-100 text-zinc-700',
  platform_statement:  'bg-zinc-100 text-zinc-700',
  income:              'bg-emerald-100 text-emerald-700',
}

const STORAGE_BUCKET = 'documents'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? 'bin'
}

function isExpenseCategory(cat: string): boolean {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(cat)
}

async function ensureBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, { public: true })
  // ignore if bucket already exists
  if (error && !error.message.includes('already exists')) {
    console.warn('[documents] bucket creation:', error.message)
  }
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  clientId,
  taxYear,
  onClose,
  onUploaded,
}: {
  clientId:   string
  taxYear:    string
  onClose:    () => void
  onUploaded: (doc: ClientDocument) => void
}) {
  const fileRef                         = useRef<HTMLInputElement>(null)
  const [category,   setCategory]       = useState<string>('fuel')
  const [file,       setFile]           = useState<File | null>(null)
  const [amount,     setAmount]         = useState('')
  const [uploading,  setUploading]      = useState(false)
  const [error,      setError]          = useState<string | null>(null)

  const showAmount = isExpenseCategory(category)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)

    try {
      await ensureBucket()

      const ext  = fileExtension(file.name)
      const path = `${clientId}/${taxYear}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false })

      if (uploadError) throw new Error(uploadError.message)

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)

      const expenseAmount = showAmount && amount ? parseFloat(amount) : undefined

      const doc = await saveDocumentRecord(
        clientId,
        taxYear,
        category,
        urlData.publicUrl,
        file.name,
        ext,
        expenseAmount,
      )

      onUploaded(doc)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-zinc-200">
        <div className="px-6 py-5 border-b border-zinc-200 flex items-start justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Upload document</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <AlertIcon className="w-3.5 h-3.5 flex-none mt-0.5 text-red-400" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
            >
              <optgroup label="Expense evidence">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </optgroup>
              <optgroup label="Compliance documents">
                {COMPLIANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {showAmount && (
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Expense amount <span className="text-zinc-400 font-normal">(optional — triggers review flag if &gt;£200)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">£</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-sm border border-zinc-200 rounded pl-7 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">File</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-zinc-200 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-800 truncate">{file.name}</p>
                  <p className="text-xs text-zinc-400">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-zinc-500">Click to select a file</p>
                  <p className="text-xs text-zinc-400">PDF, JPG, PNG or CSV</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-3 py-1.5 text-xs border border-zinc-300 rounded text-zinc-600 hover:bg-zinc-50 cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {uploading && <SpinnerIcon className="w-3 h-3 animate-spin" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Documents Panel ──────────────────────────────────────────────────────────

export function DocumentsPanel({
  clientId,
  taxYear,
  initialDocuments,
}: {
  clientId:          string
  taxYear:           string
  initialDocuments:  ClientDocument[]
}) {
  const [documents,    setDocuments]    = useState<ClientDocument[]>(initialDocuments)
  const [showUpload,   setShowUpload]   = useState(false)
  const [reviewing,    setReviewing]    = useState<string | null>(null)

  async function handleMarkReviewed(doc: ClientDocument) {
    setReviewing(doc.id)
    try {
      await markDocumentReviewed(doc.id, clientId, taxYear)
      setDocuments((prev) =>
        prev.map((d) => d.id === doc.id ? { ...d, accountant_reviewed: true, needs_review: false } : d),
      )
    } finally {
      setReviewing(null)
    }
  }

  function handleUploaded(doc: ClientDocument) {
    setDocuments((prev) => [doc, ...prev])
  }

  return (
    <>
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
            <span className="text-xs text-gray-400">{taxYear}</span>
            {documents.some((d) => d.needs_review) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-100 text-amber-700">
                {documents.filter((d) => d.needs_review).length} needs review
              </span>
            )}
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors cursor-pointer"
          >
            + Upload document
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">No documents uploaded for {taxYear}</p>
            <p className="text-xs text-zinc-400 mt-1">Upload receipts, LoE, SA302s and other supporting evidence here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">File</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${CATEGORY_BADGES[doc.category] ?? 'bg-zinc-100 text-zinc-700'}`}>
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-700 hover:text-slate-900 hover:underline truncate max-w-[200px] block"
                      >
                        {doc.file_name}
                      </a>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm text-gray-700">
                      {doc.expense_amount != null ? `£${Number(doc.expense_amount).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(doc.upload_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {doc.accountant_reviewed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-100 text-emerald-700">
                          <CheckIcon className="w-3 h-3" />
                          Reviewed
                        </span>
                      ) : doc.needs_review ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-100 text-amber-700">
                          Needs review
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-zinc-100 text-zinc-500">
                          Uploaded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {doc.needs_review && !doc.accountant_reviewed && (
                        <button
                          onClick={() => handleMarkReviewed(doc)}
                          disabled={reviewing === doc.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-zinc-200 rounded hover:bg-zinc-100 disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          {reviewing === doc.id
                            ? <SpinnerIcon className="w-3 h-3 animate-spin" />
                            : <CheckIcon className="w-3 h-3" />
                          }
                          Mark reviewed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          clientId={clientId}
          taxYear={taxYear}
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </>
  )
}
