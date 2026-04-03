import type { TaxYearConfig } from '@/types/tax'

// ─── Tax Year Definitions ─────────────────────────────────────────────────────
//
// To add a new tax year:
//   1. Add a new entry to TAX_YEARS below.
//   2. Update DEFAULT_TAX_YEAR if needed.
//   3. Nothing else changes — the calculator and UI are config-driven.
//
// Sources:
//   Mileage rates:    https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31205
//   Income tax rates: https://www.gov.uk/income-tax-rates
//   NI rates:         https://www.gov.uk/national-insurance/how-much-you-pay
//   Payment dates:    https://www.gov.uk/self-assessment-tax-returns/deadlines

const TAX_YEARS: Record<string, TaxYearConfig> = {
  '2025/26': {
    year:      '2025/26',
    startDate: '2025-04-06',
    endDate:   '2026-04-05',

    mileageRates: [
      { bandSizeMiles: 10_000, ratePerMile: 0.45 }, // first 10,000 miles
      { bandSizeMiles: null,   ratePerMile: 0.25 }, // above 10,000 miles
    ],

    incomeTax: {
      personalAllowance: 12_570,
      // Above £100,000 the allowance reduces by £1 per £2 of excess income,
      // fully withdrawn at £125,140 (i.e. £100,000 + 2 × £12,570).
      taperThreshold: 100_000,
      bands: [
        { label: 'Basic rate',      from: 0,       to: 37_700,  rate: 0.20 },
        { label: 'Higher rate',     from: 37_700,  to: 112_570, rate: 0.40 },
        { label: 'Additional rate', from: 112_570, to: null,    rate: 0.45 },
      ],
    },

    nationalInsurance: {
      class2: {
        smallProfitsThreshold: 12_570,
        // Class 2 is no longer a mandatory payment from April 2024.
        // State pension credit is automatic if profits exceed the threshold.
        // Voluntary rate shown for clients who wish to fill NI record gaps.
        weeklyRate:  3.45,
        weeksInYear: 52,
      },
      class4: {
        lowerProfitsLimit: 12_570,
        upperProfitsLimit: 50_270,
        lowerRate:         0.06, // 6% on profits between lower and upper limit
        upperRate:         0.02, // 2% on profits above upper limit
      },
    },

    payments: {
      // 31 January 2027 — filing deadline, balancing payment, and first POA
      januaryDate: '2027-01-31',
      // 31 July 2027 — second payment on account
      julyDate:    '2027-07-31',
      // Payments on account are only required if the SA liability exceeds £1,000
      onAccountThreshold: 1_000,
    },
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
