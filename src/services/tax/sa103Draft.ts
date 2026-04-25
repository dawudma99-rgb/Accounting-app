import type { SA103Draft, SA103ExpenseLine, SA103Flag, SA103VehicleLine } from '@/types/sa103'
import type { TaxSummary, TaxYearConfig, VehicleDeduction } from '@/types/tax'
import type { BusinessType } from '@/types/transaction'

const BUSINESS_TYPE_DESCRIPTIONS: Record<BusinessType, string> = {
  mechanic: 'Motor vehicle repair and servicing',
  plumber:  'Plumbing and heating engineer',
  taxi:     'Taxi and private hire driver',
}

// ─── Vehicle method note ──────────────────────────────────────────────────────

function buildVehicleMethodNote(v: VehicleDeduction): string {
  if (v.method === 'rental') {
    const rental = v.allowableRentalClaim ?? 0
    const fuel   = v.allowableFuelClaim   ?? 0
    return (
      `Rental method used. Allowable rental claim: £${rental.toFixed(2)}` +
      (fuel > 0 ? `; separate fuel claim: £${fuel.toFixed(2)}.` : '.')
    )
  }

  if (v.method === 'actual') {
    const gross    = v.actualCostsGross    ?? 0
    const allowable = v.allowableActualCosts ?? 0
    const wda       = v.capitalAllowance?.allowableWDA ?? 0
    const note = `Actual costs method. Gross vehicle costs: £${gross.toFixed(2)}`
      + (v.businessUsePercent !== null ? ` × ${(v.businessUsePercent! * 100).toFixed(0)}% business use = £${allowable.toFixed(2)}` : '')
      + (wda > 0 ? ` + WDA £${wda.toFixed(2)}` : '') + '.'

    if (v.yearOneComparison) {
      const yoc = v.yearOneComparison
      return note + ` Year one comparison: mileage would have been £${yoc.mileageClaim.toFixed(2)} — saving £${yoc.saving.toFixed(2)} on ${yoc.recommendedMethod === 'actual' ? 'actual costs' : 'mileage'} method.`
    }
    return note
  }

  // Mileage method
  const miles      = v.businessMiles ?? 0
  const allowance  = v.mileageAllowance ?? 0
  const bandDetail = v.mileageBandBreakdown
    ?.map((b) => `${b.miles.toLocaleString()} mi × ${(b.ratePerMile * 100).toFixed(0)}p`)
    .join(' + ') ?? ''

  return `HMRC mileage allowance: ${miles.toLocaleString()} miles (${bandDetail}) = £${allowance.toFixed(2)}.`
}

// ─── Flag generator ───────────────────────────────────────────────────────────

function generateFlags(summary: TaxSummary, client: { utr: string | null }, vehicleNote: string): SA103Flag[] {
  const flags: SA103Flag[] = []

  if (!client.utr) {
    flags.push({ severity: 'action', label: 'UTR missing', message: 'UTR not recorded — required before filing.' })
  }

  if (summary.flaggedTransactionCount > 0) {
    flags.push({
      severity: 'action',
      label:    'Unresolved transactions',
      message:  `${summary.flaggedTransactionCount} flagged transaction${summary.flaggedTransactionCount !== 1 ? 's' : ''} excluded from figures. Resolve in Dashboard before treating this as final.`,
    })
  }

  if (summary.outOfRangeTransactionCount > 0) {
    flags.push({
      severity: 'warning',
      label:    'Date range',
      message:  `${summary.outOfRangeTransactionCount} saved transaction${summary.outOfRangeTransactionCount !== 1 ? 's' : ''} outside ${summary.taxYear} were excluded.`,
    })
  }

  const otherLine = summary.nonVehicleExpenses.find((e) => e.category === 'other')
  if (otherLine && otherLine.amount > 0) {
    flags.push({
      severity: 'warning',
      label:    'Other expenses',
      message:  `£${otherLine.amount.toFixed(2)} recorded as 'Other expenses'. Review each item for business purpose.`,
    })
  }

  if (summary.isLossYear) {
    flags.push({
      severity: 'info',
      label:    'Trading loss',
      message:  `Trading loss of £${Math.abs(summary.netProfitPreAdjustments).toFixed(2)}. Confirm offset treatment with client before filing.`,
    })
  }

  if (summary.overlapRelief > 0) {
    flags.push({
      severity: 'info',
      label:    'Overlap relief',
      message:  `£${summary.overlapRelief.toFixed(2)} overlap relief deducted. Verify figure with client before filing.`,
    })
  }

  if (summary.lossesBroughtForward > 0) {
    flags.push({
      severity: 'info',
      label:    'Losses brought forward',
      message:  `£${summary.lossesBroughtForward.toFixed(2)} losses b/f applied. Remaining c/f: £${summary.lossesCarriedForward.toFixed(2)}.`,
    })
  }

  if (summary.liability.otherIncome > 0) {
    flags.push({
      severity: 'info',
      label:    'Other income',
      message:  `£${summary.liability.otherIncome.toFixed(2)} other income included. Confirm source and supplementary pages required.`,
    })
  }

  flags.push({ severity: 'info', label: 'Vehicle method', message: vehicleNote })

  return flags
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildSA103Draft(
  summary: TaxSummary,
  client: { name: string; utr: string | null; business_type: BusinessType },
  config: TaxYearConfig,
): SA103Draft {
  const formVersion = summary.turnover <= config.sa103sThreshold ? 'SA103S' : 'SA103F'

  const expenseLines: SA103ExpenseLine[] = summary.nonVehicleExpenses.map((e) => ({
    hmrcLabel: e.label,
    amount:    e.amount,
  }))

  const vehicleNote = buildVehicleMethodNote(summary.vehicle)
  const vehicleLine: SA103VehicleLine = {
    hmrcLabel:  'Motor expenses',
    method:     summary.vehicle.method,
    amount:     summary.vehicle.chosenAmount,
    methodNote: vehicleNote,
  }

  const flags            = generateFlags(summary, client, vehicleNote)
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

    netProfit:             summary.netProfitPreAdjustments,
    isLoss:                summary.isLossYear,
    taxableProfitForSA100: summary.taxableProfit,

    flags,
    hasBlockingFlags,
  }
}
