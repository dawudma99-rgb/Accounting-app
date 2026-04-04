import type { SA103Draft, SA103ExpenseLine, SA103Flag, SA103VehicleLine } from '@/types/sa103'
import type { TaxSummary, TaxYearConfig } from '@/types/tax'
import type { BusinessType } from '@/types/transaction'

// ─── Business type descriptions ───────────────────────────────────────────────

const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  mechanic: 'Motor vehicle repair and servicing',
  plumber:  'Plumbing and heating engineer',
  taxi:     'Taxi and private hire driver',
}

// ─── Vehicle method note builder ──────────────────────────────────────────────

function buildVehicleMethodNote(summary: TaxSummary): string {
  const { vehicle } = summary

  if (vehicle.mileageAllowance === null) {
    return `Actual motor costs claimed (£${vehicle.actualCosts.toFixed(2)} from bank statement). No mileage comparison — enter business miles in Tax Summary to verify.`
  }

  const bandDetail = vehicle.mileageBandBreakdown
    ?.map((b) => `${b.miles.toLocaleString()} mi × ${(b.ratePerMile * 100).toFixed(0)}p`)
    .join(' + ') ?? ''

  if (vehicle.chosenMethod === 'mileage') {
    return (
      `HMRC mileage allowance used: ${vehicle.businessMiles!.toLocaleString()} miles ` +
      `(${bandDetail}) = £${vehicle.chosenAmount.toFixed(2)}. ` +
      `Actual costs were £${vehicle.actualCosts.toFixed(2)} — ` +
      `mileage allowance is £${(vehicle.saving ?? 0).toFixed(2)} higher.`
    )
  }

  return (
    `Actual motor costs used: £${vehicle.actualCosts.toFixed(2)}. ` +
    `HMRC mileage allowance (${vehicle.businessMiles!.toLocaleString()} miles) ` +
    `would have been £${vehicle.mileageAllowance.toFixed(2)} — ` +
    `actual costs are £${(vehicle.saving ?? 0).toFixed(2)} higher.`
  )
}

// ─── Flag generator ───────────────────────────────────────────────────────────

function generateFlags(
  summary: TaxSummary,
  client: { utr: string | null },
  vehicleNote: string,
): SA103Flag[] {
  const flags: SA103Flag[] = []

  // Blocking: UTR missing
  if (!client.utr) {
    flags.push({
      severity: 'action',
      label:    'UTR missing',
      message:  'UTR not recorded on this client — required before the return can be filed.',
    })
  }

  // Blocking: unresolved flagged transactions
  if (summary.flaggedTransactionCount > 0) {
    flags.push({
      severity: 'action',
      label:    'Unresolved transactions',
      message:
        `${summary.flaggedTransactionCount} flagged transaction` +
        `${summary.flaggedTransactionCount !== 1 ? 's' : ''} ` +
        `were excluded from these figures. Resolve them in the Dashboard before treating this draft as final.`,
    })
  }

  // Warning: transactions outside the tax year
  if (summary.outOfRangeTransactionCount > 0) {
    flags.push({
      severity: 'warning',
      label:    'Date range',
      message:
        `${summary.outOfRangeTransactionCount} saved transaction` +
        `${summary.outOfRangeTransactionCount !== 1 ? 's' : ''} ` +
        `are dated outside ${summary.taxYear} and were excluded. ` +
        `Confirm the bank statement covers the full tax year.`,
    })
  }

  // Warning: turnover above SA103S threshold (already shown by formVersion,
  // but an explicit flag ensures the accountant doesn't miss it)
  // (handled by caller — formVersion drives this)

  // Warning: 'other' expenses present
  const otherLine = summary.nonVehicleExpenses.find((e) => e.category === 'other')
  if (otherLine && otherLine.amount > 0) {
    flags.push({
      severity: 'warning',
      label:    'Other expenses',
      message:
        `£${otherLine.amount.toFixed(2)} is recorded as 'Other expenses'. ` +
        `Review individual items to confirm each is wholly and exclusively for business purposes.`,
    })
  }

  // Info: net loss treatment
  if (summary.netProfit < 0) {
    flags.push({
      severity: 'info',
      label:    'Trading loss',
      message:
        `Trading loss of £${Math.abs(summary.netProfit).toFixed(2)}. ` +
        `This may be offset against other income in the year or carried forward against future self-employment profits. ` +
        `Confirm treatment with client before filing.`,
    })
  }

  // Info: other income included in tax estimate
  if (summary.liability.otherIncome > 0) {
    flags.push({
      severity: 'info',
      label:    'Other income',
      message:
        `£${summary.liability.otherIncome.toFixed(2)} of other income was included in the tax estimate. ` +
        `Confirm source and whether it should appear on a separate supplementary page.`,
    })
  }

  // Info: vehicle method
  flags.push({
    severity: 'info',
    label:    'Vehicle method',
    message:  vehicleNote,
  })

  return flags
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Pure function. Maps a completed TaxSummary + client identity into a
 * structured SA103Draft ready for accountant review.
 *
 * No I/O, no side effects. Call this client-side from the Tax Summary view
 * once the summary has been loaded.
 */
export function buildSA103Draft(
  summary: TaxSummary,
  client: { name: string; utr: string | null; business_type: BusinessType },
  config: TaxYearConfig,
): SA103Draft {
  const formVersion = summary.turnover <= config.sa103sThreshold ? 'SA103S' : 'SA103F'

  // Expense lines (non-vehicle)
  const expenseLines: SA103ExpenseLine[] = summary.nonVehicleExpenses.map((e) => ({
    hmrcLabel: e.label,
    amount:    e.amount,
  }))

  // Vehicle line
  const vehicleNote = buildVehicleMethodNote(summary)
  const vehicleLine: SA103VehicleLine = {
    hmrcLabel:  'Motor expenses',
    method:     summary.vehicle.chosenMethod,
    amount:     summary.vehicle.chosenAmount,
    methodNote: vehicleNote,
  }

  // Flags
  const flags = generateFlags(summary, client, vehicleNote)
  const hasBlockingFlags = flags.some((f) => f.severity === 'action')

  return {
    taxYear:             summary.taxYear,
    formVersion,
    clientName:          client.name,
    utr:                 client.utr,
    businessDescription: BUSINESS_TYPE_DESCRIPTIONS[client.business_type],
    generatedDate:       new Date().toISOString().slice(0, 10),

    turnover:            summary.turnover,
    otherBusinessIncome: 0,
    totalBusinessIncome: summary.turnover,

    expenseLines,
    vehicleLine,
    totalAllowableExpenses: summary.totalAllowableExpenses,

    netProfit:              summary.netProfit,
    isLoss:                 summary.netProfit < 0,
    taxableProfitForSA100:  Math.max(0, summary.netProfit),

    flags,
    hasBlockingFlags,
  }
}
