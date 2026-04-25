'use client'

import { useState, useEffect } from 'react'
import { getClients, getClientFlagCounts } from '../actions'
import type { ClientRecord } from '../actions'
import { BUSINESS_TYPE_LABELS } from '../constants'
import { CreateClientModal } from './CreateClientModal'
import { SpinnerIcon, UsersIcon, ChevronRightIcon } from './icons'

export function ClientsView({
  onViewClient,
  onNewClient,
}: {
  onViewClient: (client: ClientRecord) => void
  onNewClient: (client: ClientRecord) => void
}) {
  const [clients,    setClients]    = useState<ClientRecord[]>([])
  const [flagCounts, setFlagCounts] = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    Promise.all([getClients(), getClientFlagCounts()])
      .then(([c, f]) => { setClients(c); setFlagCounts(f) })
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded transition-colors cursor-pointer"
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
            <div className="w-12 h-12 rounded bg-zinc-100 flex items-center justify-center mb-3">
              <UsersIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No clients yet</p>
            <p className="text-xs text-gray-400 mt-1">Create a client to start processing their transactions</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded transition-colors cursor-pointer"
            >
              + New Client
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">UTR</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Flags</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => onViewClient(client)}
                    className="cursor-pointer hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-medium text-gray-900">{client.name}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-zinc-100 text-zinc-700">
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
                    <td className="px-4 py-3.5">
                      {flagCounts[client.id] ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold bg-red-100 text-red-700">
                          {flagCounts[client.id]} open
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
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
