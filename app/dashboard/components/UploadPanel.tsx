'use client'

import { useRef } from 'react'
import { SpinnerIcon, UploadIcon, CheckIcon, XIcon } from './icons'

function UploadZone({
  label, description, accept, files, inputRef, onAdd, onRemove,
}: {
  label: string
  description: string
  accept: string
  files: File[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onAdd: (files: FileList) => void
  onRemove: (index: number) => void
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

export function UploadPanel({
  onProcess,
  processingProgress,
  bankStatements,
  onBankStatementsChange,
  platformStatements,
  onPlatformStatementsChange,
  receipts,
  onReceiptsChange,
}: {
  onProcess: () => void
  processingProgress: { done: number; total: number } | null
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
          {processingProgress !== null
            ? `Categorising ${processingProgress.done} / ${processingProgress.total}…`
            : bankStatements.length > 0
            ? 'Ready to process'
            : 'Upload at least one bank statement CSV to continue'}
        </p>
        <button
          onClick={onProcess}
          disabled={processingProgress !== null || bankStatements.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {processingProgress !== null ? (
            <><SpinnerIcon className="w-4 h-4 animate-spin" /> {processingProgress.done} / {processingProgress.total}</>
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
