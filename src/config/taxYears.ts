import type { TaxYearConfig } from '@/types/tax'

// ─── Tax Year Definitions ─────────────────────────────────────────────────────
//
// To add a new tax year:
//   1. Add a new entry to TAX_YEARS below.
//   2. Update DEFAULT_TAX_YEAR if needed.
//   3. Nothing else changes — the calculator and UI are config-driven.
//
// HMRC mileage rates source:
//   https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31205
//
// Mileage bands are defined as widths (bandSizeMiles), not cumulative ceilings.
// The calculator walks the bands in order, consuming miles until exhausted.

const TAX_YEARS: Record<string, TaxYearConfig> = {
  '2025/26': {
    year:      '2025/26',
    startDate: '2025-04-06',
    endDate:   '2026-04-05',
    mileageRates: [
      { bandSizeMiles: 10_000, ratePerMile: 0.45 }, // first 10,000 miles
      { bandSizeMiles: null,   ratePerMile: 0.25 }, // above 10,000 miles
    ],
  },
}

export const DEFAULT_TAX_YEAR = '2025/26'

export function getTaxYearConfig(year: string): TaxYearConfig {
  const config = TAX_YEARS[year]
  if (!config) throw new Error(`No tax year config found for "${year}"`)
  return config
}

export function getAvailableTaxYears(): string[] {
  return Object.keys(TAX_YEARS)
}
