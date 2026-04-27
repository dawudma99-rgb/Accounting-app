'use client'

import { useState, useEffect } from 'react'
import { getClients } from './actions'
import type { ClientRecord } from './actions'
import type { View, DashboardTransaction } from './types'
import { BUSINESS_TYPE_LABELS } from './constants'
import { DEFAULT_TAX_YEAR, getAvailableTaxYears } from '@/config/taxYears'
import { useDashboardRun } from './hooks/useDashboardRun'
import { Sidebar }            from './components/Sidebar'
import { UploadPanel }        from './components/UploadPanel'
import { SummaryCards }       from './components/SummaryCards'
import { BulkApproveBar }     from './components/BulkApproveBar'
import { TransactionsTable, DetailModal } from './components/TransactionsTable'
import { CreateClientModal }  from './components/CreateClientModal'
import { ClientsView }        from './components/ClientsView'
import { ClientDetailView }   from './components/ClientDetailView'
import { TaxView }            from './components/TaxView'
import { AlertIcon, BrainIcon, UploadIcon } from './components/icons'

export default function DashboardPage() {
  // ── Navigation ──
  const [currentView,   setCurrentView]   = useState<View>('dashboard')
  const [viewingClient, setViewingClient] = useState<ClientRecord | null>(null)

  // ── Client selector ──
  const [allClients,       setAllClients]       = useState<ClientRecord[]>([])
  const [selectedClient,   setSelectedClient]   = useState<ClientRecord | null>(null)
  const [showCreateClient, setShowCreateClient] = useState(false)

  // ── Tax year ──
  const [dashboardTaxYear, setDashboardTaxYear] = useState(DEFAULT_TAX_YEAR)
  const availableYears = getAvailableTaxYears()

  // ── File picker state ──
  const [bankFiles,     setBankFiles]     = useState<File[]>([])
  const [platformFiles, setPlatformFiles] = useState<File[]>([])
  const [receiptFiles,  setReceiptFiles]  = useState<File[]>([])

  // ── Transaction detail modal ──
  const [selected, setSelected] = useState<DashboardTransaction | null>(null)

  // ── Run orchestration ──
  const run = useDashboardRun(selectedClient, dashboardTaxYear)

  useEffect(() => {
    getClients().then(setAllClients)
  }, [])

  function handleNavigate(view: View) {
    setCurrentView(view)
    if (view !== 'client-detail') setViewingClient(null)
  }

  function handleViewClient(client: ClientRecord) {
    setViewingClient(client)
    setCurrentView('client-detail')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />

      <main className="flex-1 overflow-y-auto">

        {/* ── Dashboard view ── */}
        {currentView === 'dashboard' && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
                </div>

                <select
                  value={dashboardTaxYear}
                  onChange={(e) => setDashboardTaxYear(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>Tax year {y}</option>
                  ))}
                </select>

                {/* Client selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedClient?.id ?? ''}
                    onChange={(e) => {
                      const client = allClients.find((c) => c.id === e.target.value) ?? null
                      setSelectedClient(client)
                    }}
                    className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="">Select client…</option>
                    {allClients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowCreateClient(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-700 border border-zinc-300 rounded hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>

                {selectedClient && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-zinc-100 text-zinc-700">
                    {BUSINESS_TYPE_LABELS[selectedClient.business_type]}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {run.merchantMemory.size > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-zinc-100 text-zinc-600">
                    <BrainIcon className="w-3 h-3" />
                    {run.merchantMemory.size} rule{run.merchantMemory.size !== 1 ? 's' : ''} saved
                  </span>
                )}
                {run.transactions.length > 0 && (
                  <button
                    onClick={run.handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded transition-colors cursor-pointer"
                  >
                    <UploadIcon className="w-3.5 h-3.5 rotate-180" />
                    Download CSV
                  </button>
                )}
                <span className="text-xs text-gray-400">29 Mar 2026</span>
                <div className="w-px h-4 bg-gray-200" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-zinc-100 text-zinc-500">
                  Beta
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-6 space-y-5 max-w-7xl">
              <UploadPanel
                onProcess={() => run.handleProcess(bankFiles, platformFiles, receiptFiles)}
                processingProgress={run.processingProgress}
                bankStatements={bankFiles}
                onBankStatementsChange={setBankFiles}
                platformStatements={platformFiles}
                onPlatformStatementsChange={setPlatformFiles}
                receipts={receiptFiles}
                onReceiptsChange={setReceiptFiles}
              />

              {run.error && (
                <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <AlertIcon className="w-4 h-4 text-red-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">Failed to process</p>
                    <p className="mt-0.5 text-red-600">{run.error}</p>
                  </div>
                </div>
              )}

              {run.unmatchedReceipts.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {run.unmatchedReceipts.length} receipt{run.unmatchedReceipts.length !== 1 ? 's' : ''} not found in bank statement
                    </p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {run.unmatchedReceipts.map((u, i) => (
                        <li key={i}>{u.receipt.fileName} — {u.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {run.unmatchedPayouts.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {run.unmatchedPayouts.length} Uber payout{run.unmatchedPayouts.length !== 1 ? 's' : ''} not found in bank statement
                    </p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {run.unmatchedPayouts.map((u, i) => (
                        <li key={i}>{u.row.sourceLabel} — {u.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {run.parseWarnings.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
                  <AlertIcon className="w-4 h-4 text-amber-500 flex-none mt-0.5" />
                  <div>
                    <p className="font-semibold">{run.parseWarnings.length} row{run.parseWarnings.length !== 1 ? 's' : ''} skipped during import</p>
                    <ul className="mt-1 space-y-0.5 text-amber-600">
                      {run.parseWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              <SummaryCards transactions={run.transactions} />

              {run.transactions.length > 0 && (
                <BulkApproveBar
                  transactions={run.transactions}
                  onApprove={run.handleBulkApprove}
                  isSaving={run.isBulkSaving}
                />
              )}

              <TransactionsTable transactions={run.transactions} onSelect={setSelected} />
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
            onSelectClient={setSelectedClient}
          />
        )}

      </main>

      {/* ── Modals (rendered outside main to avoid scroll clipping) ── */}

      {selected && currentView === 'dashboard' && (
        <DetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onApprove={run.handleApprove}
          onRecategorise={run.handleRecategorise}
        />
      )}

      {showCreateClient && (
        <CreateClientModal
          onClose={() => setShowCreateClient(false)}
          onCreated={(client) => {
            setAllClients((prev) => [client, ...prev])
            setSelectedClient(client)
            setShowCreateClient(false)
          }}
        />
      )}
    </div>
  )
}
