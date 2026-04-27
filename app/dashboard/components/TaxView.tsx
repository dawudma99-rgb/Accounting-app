'use client'

import { useState, useEffect, useMemo } from 'react'
import { getTaxSummary, getReturnEvaluation, advanceReturn, getSavedTaxInputs, saveTaxFigures, syncSummaryFlags } from '../actions'
import type { ClientRecord } from '../actions'
import type { ReturnEvaluation, ReturnStatus } from '../types'
import type { TaxSummary } from '@/types/tax'
import { ReturnStatusGate } from './ReturnStatusGate'
import { DEFAULT_TAX_YEAR, getAvailableTaxYears, getTaxYearConfig } from '@/config/taxYears'
import { buildSA103Draft } from '@/services/tax/sa103Draft'
import type { SA103Draft } from '@/types/sa103'
import { buildSA100Preview } from '@/services/tax/sa100Preview'
import type { SA100Preview } from '@/types/sa100'
import { STUDENT_LOAN_PLAN_LABELS } from '@/types/sa100'
import type { StudentLoanPlan } from '@/types/sa100'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../constants'
import { SpinnerIcon, AlertIcon, TaxIcon, CheckIcon, XIcon } from './icons'

export function TaxView({
  selectedClient,
  allClients,
  onSelectClient,
}: {
  selectedClient:  ClientRecord | null
  allClients:      ClientRecord[]
  onSelectClient:  (c: ClientRecord | null) => void
}) {
  const availableYears = getAvailableTaxYears()

  const [taxYear,            setTaxYear]            = useState(DEFAULT_TAX_YEAR)
  const [milesInput,         setMilesInput]         = useState('')
  const [appliedMiles,       setAppliedMiles]       = useState<number | undefined>(undefined)
  const [otherIncomeInput,   setOtherIncomeInput]   = useState('')
  const [appliedOtherIncome, setAppliedOtherIncome] = useState<number | undefined>(undefined)
  const [summary,            setSummary]            = useState<TaxSummary | null>(null)
  const [evaluation,         setEvaluation]         = useState<ReturnEvaluation | null>(null)
  const [advancing,          setAdvancing]          = useState(false)
  const [saving,             setSaving]             = useState(false)
  const [savedAt,            setSavedAt]            = useState<string | null>(null)
  const [inputsReady,        setInputsReady]        = useState(false)
  const [loading,            setLoading]            = useState(false)
  const [error,              setError]              = useState<string | null>(null)
  const [taxPaidInput,         setTaxPaidInput]         = useState('')
  const [appliedTaxPaid,       setAppliedTaxPaid]       = useState<number>(0)
  const [studentLoanPlan,      setStudentLoanPlan]      = useState<StudentLoanPlan | undefined>(undefined)
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false)

  // Effect 1: load saved inputs whenever client/year changes
  useEffect(() => {
    setInputsReady(false)
    if (!selectedClient) {
      setMilesInput(''); setAppliedMiles(undefined)
      setOtherIncomeInput(''); setAppliedOtherIncome(undefined)
      setTaxPaidInput(''); setAppliedTaxPaid(0)
      setStudentLoanPlan(undefined); setDeclarationConfirmed(false)
      setSavedAt(null); setSummary(null); setEvaluation(null)
      setInputsReady(true)
      return
    }
    getSavedTaxInputs(selectedClient.id, taxYear)
      .then((saved) => {
        if (saved) {
          if (saved.businessMiles != null)  { setAppliedMiles(saved.businessMiles); setMilesInput(String(saved.businessMiles)) }
          if (saved.otherIncome   != null)  { setAppliedOtherIncome(saved.otherIncome); setOtherIncomeInput(String(saved.otherIncome)) }
          setAppliedTaxPaid(saved.taxPaidAtSource)
          setTaxPaidInput(saved.taxPaidAtSource > 0 ? String(saved.taxPaidAtSource) : '')
          setStudentLoanPlan((saved.studentLoanPlan as StudentLoanPlan | undefined) ?? undefined)
          setDeclarationConfirmed(saved.declarationConfirmed)
          setSavedAt(saved.figuresSavedAt)
        }
      })
      .catch(() => { /* inputs stay at defaults */ })
      .finally(() => setInputsReady(true))
  }, [selectedClient?.id, taxYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: calculate whenever inputs change (fires after Effect 1 sets inputsReady)
  useEffect(() => {
    if (!inputsReady || !selectedClient) { if (!selectedClient) { setSummary(null); setEvaluation(null) } return }
    setLoading(true)
    setError(null)
    Promise.all([
      getTaxSummary(selectedClient.id, taxYear, appliedMiles, appliedOtherIncome),
      getReturnEvaluation(selectedClient.id, taxYear),
    ])
      .then(([s, e]) => { setSummary(s); setEvaluation(e) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedClient?.id, taxYear, appliedMiles, appliedOtherIncome, inputsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdvance(to: ReturnStatus) {
    if (!selectedClient) return
    setAdvancing(true)
    try {
      const updated = await advanceReturn(selectedClient.id, taxYear, to)
      setEvaluation(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance return status')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleSave() {
    if (!selectedClient || !summary) return
    setSaving(true)
    try {
      await saveTaxFigures(
        selectedClient.id,
        taxYear,
        {
          businessMiles:        appliedMiles,
          otherIncome:          appliedOtherIncome,
          taxPaidAtSource:      appliedTaxPaid,
          studentLoanPlan:      studentLoanPlan,
          declarationConfirmed,
        },
        {
          turnover:                 summary.turnover,
          totalAllowableExpenses:   summary.totalAllowableExpenses,
          taxableProfit:            summary.taxableProfit,
          totalIncomeTax:           summary.liability.totalIncomeTax,
          niClass2Annual:           summary.liability.niClass2Annual,
          totalNiClass4:            summary.liability.totalNiClass4,
          totalStudentLoan:         summary.liability.totalStudentLoan,
          totalLiability:           summary.liability.totalLiability,
          requiresPaymentOnAccount: summary.liability.requiresPaymentOnAccount,
          poaPerPayment:            summary.liability.poaPerPayment,
          balancingPayment:         summary.liability.balancingPayment,
          lossesCarriedForward:     summary.lossesCarriedForward,
          januaryDate:              summary.liability.januaryDate,
          julyDate:                 summary.liability.julyDate,
        },
      )
      // Sync summary-derived flags to DB so evaluateReturn sees them
      await syncSummaryFlags(selectedClient.id, taxYear, summary)
      const now = new Date().toISOString()
      setSavedAt(now)
      // Refresh evaluation — clears figures_not_saved blocker, reflects new flags
      const updated = await getReturnEvaluation(selectedClient.id, taxYear)
      setEvaluation(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save figures')
    } finally {
      setSaving(false)
    }
  }

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

  function handleApplyTaxPaid() {
    const amount = Number(taxPaidInput.replace(/,/g, '').replace(/£/g, ''))
    if (!Number.isFinite(amount) || amount < 0) return
    setAppliedTaxPaid(amount)
  }

  function handleClearTaxPaid() {
    setTaxPaidInput('')
    setAppliedTaxPaid(0)
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

  const flagColors: Record<string, string> = {
    action:  'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    info:    'bg-blue-50 border-blue-200 text-blue-700',
  }
  const flagIcons: Record<string, string> = {
    action: '⚠', warning: '⚠', info: 'ℹ',
  }

  const sa103Draft = useMemo<SA103Draft | null>(() => {
    if (!selectedClient || !summary) return null
    return buildSA103Draft(summary, selectedClient, getTaxYearConfig(taxYear))
  }, [summary, selectedClient, taxYear])

  const sa100Preview = useMemo<SA100Preview | null>(() => {
    if (!selectedClient || !summary) return null
    return buildSA100Preview(
      summary,
      selectedClient.utr ?? null,
      {
        taxPaidAtSource:       appliedTaxPaid,
        studentLoanPlan,
        declarationConfirmed,
        sa103HasBlockingFlags: sa103Draft?.hasBlockingFlags ?? false,
      },
      getTaxYearConfig(taxYear),
    )
  }, [summary, selectedClient, taxYear, appliedTaxPaid, studentLoanPlan, declarationConfirmed, sa103Draft])

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
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Select client…</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={taxYear}
            onChange={(e) => { setTaxYear(e.target.value); setAppliedMiles(undefined); setMilesInput('') }}
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
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
            <div className="w-12 h-12 rounded bg-zinc-100 flex items-center justify-center mb-3">
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
          <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <AlertIcon className="w-4 h-4 text-red-500 flex-none mt-0.5" />
            <p>{error}</p>
          </div>
        ) : !summary ? null : (
          <>
            {/* ── Return status gate ── */}
            {evaluation && (
              <ReturnStatusGate
                evaluation={evaluation}
                onAdvance={handleAdvance}
                advancing={advancing}
              />
            )}

            {/* ── Summary cards ── */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                  <p className="text-xs text-gray-500 font-medium">Turnover</p>
                </div>
                <p className="text-xl font-semibold tracking-tight tabular-nums text-emerald-700">{fmt(summary.turnover)}</p>
                <p className="text-xs text-gray-400 mt-1">{summary.incomeCount} income transaction{summary.incomeCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-sm bg-red-500" />
                  <p className="text-xs text-gray-500 font-medium">Total Allowable Expenses</p>
                </div>
                <p className="text-xl font-semibold tracking-tight tabular-nums text-red-600">{fmt(summary.totalAllowableExpenses)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Vehicle: {summary.vehicle.method === 'mileage' ? 'mileage method' : 'actual costs'}
                </p>
              </div>
              <div className="bg-white rounded-md border border-gray-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-sm ${summary.netProfitPreAdjustments >= 0 ? 'bg-slate-500' : 'bg-red-400'}`} />
                  <p className="text-xs text-gray-500 font-medium">{summary.netProfitPreAdjustments >= 0 ? 'Net Profit' : 'Net Loss'}</p>
                </div>
                <p className={`text-2xl font-bold tracking-tight ${summary.netProfitPreAdjustments >= 0 ? 'text-zinc-90000' : 'text-red-600'}`}>
                  {summary.netProfitPreAdjustments < 0 ? '−' : ''}{fmt(summary.netProfitPreAdjustments)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Turnover minus all deductions</p>
              </div>
            </div>

            {/* ── Detailed breakdown ── */}
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Expense Breakdown</h2>
                <p className="text-xs text-gray-400 mt-0.5">Tax year {summary.taxYear} · {summary.approvedTransactionCount} approved transactions</p>
              </div>

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
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm text-gray-700">Actual fuel / vehicle costs</span>
                      {summary.vehicle.method === 'actual' && summary.vehicle.mileageAllowance !== null && summary.vehicle.yearOneComparison && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600">
                          ✓ Using this · saves {fmt(summary.vehicle.yearOneComparison.saving)}
                        </span>
                      )}
                      {summary.vehicle.method === 'actual' && summary.vehicle.mileageAllowance === null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600">
                          Using this
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(summary.vehicle.actualCostsGross ?? 0)}</span>
                  </div>

                  {summary.vehicle.mileageAllowance !== null && (
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-sm text-gray-700">
                          HMRC mileage allowance ({summary.vehicle.businessMiles!.toLocaleString()} miles)
                        </span>
                        {summary.vehicle.method === 'mileage' && summary.vehicle.yearOneComparison && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600">
                            ✓ Using this · saves {fmt(summary.vehicle.yearOneComparison.saving)}
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
                    className="w-28 text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <span className="text-xs text-gray-400">business miles</span>
                  <button
                    onClick={handleApplyMileage}
                    disabled={!milesInput.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:bg-zinc-100 disabled:text-zinc-400 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
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
                    Vehicle deduction ({summary.vehicle.method === 'mileage' ? 'mileage method' : 'actual costs'})
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
                    {summary.netProfitPreAdjustments >= 0 ? 'Net Profit' : 'Net Loss'}
                  </span>
                  <span className={`text-xl font-bold tabular-nums ${summary.netProfitPreAdjustments >= 0 ? 'text-zinc-90000' : 'text-red-600'}`}>
                    {summary.netProfitPreAdjustments < 0 ? '−' : ''}{fmt(summary.netProfitPreAdjustments)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Tax Liability ── */}
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Tax Liability Estimate</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Income tax + Class 4 NI · {summary.taxYear}</p>
                </div>
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
                      className="w-28 pl-6 text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <button
                    onClick={handleApplyOtherIncome}
                    disabled={!otherIncomeInput.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:bg-zinc-100 disabled:text-zinc-400 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
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

              {summary.taxableProfit <= 0 ? (
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
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(summary.taxableProfit)}</span>
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
                          <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.januaryTotal)}</span>
                        </div>
                        <div className="flex justify-between items-start text-sm">
                          <div>
                            <span className="text-gray-700 font-medium">{formatDate(summary.liability.julyDate)}</span>
                            <p className="text-xs text-gray-400 mt-0.5">2nd payment on account</p>
                          </div>
                          <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.julyTotal)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start text-sm">
                        <div>
                          <span className="text-gray-700 font-medium">{formatDate(summary.liability.januaryDate)}</span>
                          <p className="text-xs text-gray-400 mt-0.5">Full amount due — no payment on account required (liability below £1,000)</p>
                        </div>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(summary.liability.januaryTotal)}</span>
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
            {sa103Draft && (
              <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-900">SA103 Draft Summary</h2>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide ${
                        sa103Draft.hasBlockingFlags
                          ? 'bg-red-100 text-red-600'
                          : 'bg-amber-100 text-amber-600'
                      }`}>DRAFT</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {sa103Draft.formVersion}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sa103Draft.clientName}
                      {sa103Draft.utr ? ` · UTR: ${sa103Draft.utr}` : ' · UTR not recorded'}
                      {' · '}{sa103Draft.businessDescription}
                      {' · '}Generated {sa103Draft.generatedDate}
                    </p>
                  </div>
                  {sa103Draft.hasBlockingFlags && (
                    <span className="text-xs font-medium text-red-600">
                      Action required before filing
                    </span>
                  )}
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Business Income</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Turnover from self-employment</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa103Draft.turnover)}</span>
                    </div>
                    {sa103Draft.otherBusinessIncome > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Other business income</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa103Draft.otherBusinessIncome)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="font-semibold text-gray-700">Total business income</span>
                      <span className="font-bold text-emerald-700 tabular-nums">{fmt(sa103Draft.totalBusinessIncome)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Allowable Expenses
                    {sa103Draft.formVersion === 'SA103S' && (
                      <span className="ml-2 normal-case font-normal text-gray-400">
                        (SA103S — shown in detail for review, filed as total)
                      </span>
                    )}
                  </p>
                  <div className="space-y-1.5">
                    {sa103Draft.expenseLines.map((line) => (
                      <div key={line.hmrcLabel} className="flex justify-between text-sm">
                        <span className="text-gray-600">{line.hmrcLabel}</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(line.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm">
                      <div>
                        <span className="text-gray-600">{sa103Draft.vehicleLine.hmrcLabel}</span>
                        <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          sa103Draft.vehicleLine.method === 'mileage'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {sa103Draft.vehicleLine.method === 'mileage' ? 'mileage method' : 'actual costs'}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa103Draft.vehicleLine.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="font-semibold text-gray-700">Total allowable expenses</span>
                      <span className="font-bold text-red-600 tabular-nums">{fmt(sa103Draft.totalAllowableExpenses)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/40">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Profit / Loss</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">
                        {sa103Draft.isLoss ? 'Net loss' : 'Net profit'}
                      </span>
                      <span className={`font-bold text-lg tabular-nums ${sa103Draft.isLoss ? 'text-red-600' : 'text-zinc-90000'}`}>
                        {sa103Draft.isLoss ? '−' : ''}{fmt(sa103Draft.netProfit)}
                      </span>
                    </div>
                    {!sa103Draft.isLoss && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Taxable profit carried to SA100</span>
                        <span className="font-semibold text-gray-700 tabular-nums">{fmt(sa103Draft.taxableProfitForSA100)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Accountant Notes</p>
                  <div className="space-y-2">
                    {sa103Draft.flags.map((flag, i) => (
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
            )}

            {/* ── SA100 Final Filing Preview ── */}
            {sa100Preview && (
              <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
                <div className={`px-6 py-4 border-b ${
                  sa100Preview.isReadyForSubmission
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-gray-100'
                } flex items-center justify-between`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-gray-900">SA100 Final Filing Preview</h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {sa100Preview.taxYear}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Full self-assessment outcome · accountant review layer before HMRC submission
                    </p>
                  </div>
                  {evaluation?.isReadyForSubmission ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded">
                      <CheckIcon className="w-3.5 h-3.5 text-white flex-none" />
                      <span className="text-xs font-bold text-white tracking-wide">READY FOR HMRC SUBMISSION</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                      <XIcon className="w-3.5 h-3.5 text-red-500 flex-none" />
                      <span className="text-xs font-bold text-red-600">
                        {evaluation
                          ? `${evaluation.blockers.length} blocker${evaluation.blockers.length !== 1 ? 's' : ''}`
                          : 'Save figures to check status'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Income</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Self-employment profit (from SA103)</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa100Preview.selfEmploymentProfit)}</span>
                    </div>
                    {sa100Preview.otherIncome > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Other income</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa100Preview.otherIncome)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        Personal allowance
                        {sa100Preview.effectivePersonalAllowance < sa100Preview.personalAllowance && (
                          <span className="ml-1.5 text-amber-600 text-xs">(tapered)</span>
                        )}
                      </span>
                      <span className="text-gray-500 tabular-nums">({fmt(sa100Preview.effectivePersonalAllowance)})</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="font-semibold text-gray-700">Taxable income</span>
                      <span className="font-bold text-gray-800 tabular-nums">{fmt(sa100Preview.taxableIncome)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Tax Breakdown</p>
                  <div className="space-y-1.5">
                    {sa100Preview.incomeTaxBands.map((band) => (
                      <div key={band.label} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">{band.label}</span>
                          <span className="text-xs text-gray-400">{(band.rate * 100).toFixed(0)}% on {fmt(band.taxableAmount)}</span>
                        </div>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(band.taxDue)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="text-gray-500">Income tax subtotal</span>
                      <span className="font-semibold text-gray-700 tabular-nums">{fmt(sa100Preview.totalIncomeTax)}</span>
                    </div>
                    {sa100Preview.niClass4Lower > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Class 4 NI (6%)</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa100Preview.niClass4Lower)}</span>
                      </div>
                    )}
                    {sa100Preview.niClass4Upper > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Class 4 NI (2%)</span>
                        <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa100Preview.niClass4Upper)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="font-bold text-gray-900">Gross tax liability</span>
                      <span className="font-bold text-red-600 tabular-nums">{fmt(sa100Preview.grossTaxLiability)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Tax Paid at Source</p>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-gray-500 whitespace-nowrap">PAYE / tax deducted at source:</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0.00"
                        value={taxPaidInput}
                        onChange={(e) => setTaxPaidInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyTaxPaid()}
                        className="w-32 pl-6 text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <button
                      onClick={handleApplyTaxPaid}
                      disabled={!taxPaidInput.trim()}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:bg-zinc-100 disabled:text-zinc-400 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                    {appliedTaxPaid > 0 && (
                      <button onClick={handleClearTaxPaid} className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Gross tax liability</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{fmt(sa100Preview.grossTaxLiability)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax paid at source</span>
                      <span className="font-semibold text-gray-800 tabular-nums">({fmt(sa100Preview.taxPaidAtSource)})</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="font-bold text-gray-900">Net tax due via Self Assessment</span>
                      <span className="font-bold text-red-600 tabular-nums">{fmt(sa100Preview.netTaxLiability)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Schedule</p>
                  {sa100Preview.requiresPaymentOnAccount ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-start text-sm">
                        <div>
                          <span className="text-gray-700 font-medium">{formatDate(sa100Preview.januaryDate)}</span>
                          <p className="text-xs text-gray-400 mt-0.5">Balancing payment + 1st payment on account (50% each)</p>
                        </div>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(sa100Preview.januaryPayment)}</span>
                      </div>
                      <div className="flex justify-between items-start text-sm">
                        <div>
                          <span className="text-gray-700 font-medium">{formatDate(sa100Preview.julyDate)}</span>
                          <p className="text-xs text-gray-400 mt-0.5">2nd payment on account</p>
                        </div>
                        <span className="font-bold text-gray-800 tabular-nums">{fmt(sa100Preview.julyPayment)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start text-sm">
                      <div>
                        <span className="text-gray-700 font-medium">{formatDate(sa100Preview.januaryDate)}</span>
                        <p className="text-xs text-gray-400 mt-0.5">Full amount due — liability below £1,000, no payment on account</p>
                      </div>
                      <span className="font-bold text-gray-800 tabular-nums">{fmt(sa100Preview.januaryPayment)}</span>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">After-tax take-home</p>
                      <p className={`text-xl font-bold tabular-nums ${sa100Preview.afterTaxProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {sa100Preview.afterTaxProfit < 0 ? '−' : ''}{fmt(sa100Preview.afterTaxProfit)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Profit after net SA liability</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Effective tax rate</p>
                      <p className="text-xl font-bold text-gray-800 tabular-nums">
                        {sa100Preview.effectiveTaxRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Net SA liability ÷ self-employment profit</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Filing Inputs</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-36 flex-none">Student loan plan:</span>
                      <select
                        value={studentLoanPlan ?? ''}
                        onChange={(e) => {
                          const v = e.target.value as StudentLoanPlan | ''
                          setStudentLoanPlan(v === '' ? undefined : v)
                        }}
                        className="text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        <option value="">— select —</option>
                        {(Object.entries(STUDENT_LOAN_PLAN_LABELS) as [StudentLoanPlan, string][]).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={declarationConfirmed}
                        onChange={(e) => setDeclarationConfirmed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-slate-700 focus:ring-slate-400 cursor-pointer"
                      />
                      <span className="text-xs text-gray-700 leading-relaxed">
                        <span className="font-semibold">Client declaration confirmed: </span>
                        To the best of my knowledge and belief, the information given in this return is correct and complete.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="px-6 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Filing Checklist</p>
                  <div className="space-y-2">
                    {sa100Preview.blockers.map((blocker, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${
                          blocker.severity === 'blocking'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        <span className="flex-none font-bold mt-0.5">
                          {blocker.severity === 'blocking' ? '✗' : '⚠'}
                        </span>
                        <div>
                          <span className="font-semibold">{blocker.label}: </span>
                          {blocker.message}
                        </div>
                      </div>
                    ))}
                    {sa100Preview.blockers.length === 0 && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-emerald-50 border-emerald-200 text-xs text-emerald-700">
                        <CheckIcon className="w-3.5 h-3.5 flex-none" />
                        <span className="font-medium">All checks passed — return is ready for submission.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save figures */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Save figures to client record</p>
                    {savedAt ? (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Last saved {new Date(savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' '}— required before advancing the return status
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Not yet saved — return cannot advance until figures are saved
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : savedAt ? (
                      <CheckIcon className="w-3.5 h-3.5" />
                    ) : null}
                    {saving ? 'Saving…' : savedAt ? 'Update saved figures' : 'Save figures'}
                  </button>
                </div>
              </div>
            )}

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
