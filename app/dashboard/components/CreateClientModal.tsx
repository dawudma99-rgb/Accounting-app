'use client'

import { useState } from 'react'
import type { BusinessType } from '@/types/transaction'
import { createClient } from '../actions'
import type { ClientRecord } from '../actions'
import { BUSINESS_TYPE_LABELS } from '../constants'
import { SpinnerIcon } from './icons'

export function CreateClientModal({
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
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Client</h2>
          <p className="text-xs text-gray-400 mt-0.5">Create a new client profile</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Client name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Davies"
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Trade type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value as BusinessType)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {(Object.entries(BUSINESS_TYPE_LABELS) as [BusinessType, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
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
