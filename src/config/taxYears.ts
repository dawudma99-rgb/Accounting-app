import type { TaxYearConfig } from '@/types/tax'

// ─── Tax Year Definitions ─────────────────────────────────────────────────────
//
// All year-specific HMRC rates and thresholds live here.
// To add a new tax year: add one entry to TAX_YEARS and update DEFAULT_TAX_YEAR.
// Nothing in the calculator or UI needs to change.
//
// Sources:
//   Mileage:      https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim31205
//   Income tax:   https://www.gov.uk/income-tax-rates
//   NI:           https://www.gov.uk/national-insurance/how-much-you-pay
//   Student loan: https://www.gov.uk/repaying-your-student-loan/what-you-pay
//   Payments:     https://www.gov.uk/self-assessment-tax-returns/deadlines

const TAX_YEARS: Record<string, TaxYearConfig> = {
  '2024/25': {
    year:      '2024/25',
    startDate: '2024-04-06',
    endDate:   '2025-04-05',

    mileageRates: [
      { bandSizeMiles: 10_000, ratePerMile: 0.45 },
      { bandSizeMiles: null,   ratePerMile: 0.25 },
    ],

    incomeTax: {
      personalAllowance: 12_570,
      taperThreshold:    100_000,
      bands: [
        { label: 'Basic rate',      from: 0,       to: 37_700,  rate: 0.20 },
        { label: 'Higher rate',     from: 37_700,  to: 125_140, rate: 0.40 },
        { label: 'Additional rate', from: 125_140, to: null,    rate: 0.45 },
      ],
    },

    nationalInsurance: {
      class2: {
        smallProfitsThreshold: 6_725,
        weeklyRate:            3.45,
        weeksInYear:           52,
      },
      class4: {
        lowerProfitsLimit: 12_570,
        upperProfitsLimit: 50_270,
        lowerRate:         0.06,
        upperRate:         0.02,
      },
    },

    studentLoans: {
      plan1: { threshold: 24_990, rate: 0.09 },
      plan2: { threshold: 27_295, rate: 0.09 },
      plan4: { threshold: 31_395, rate: 0.09 },
      pgl:   { threshold: 21_000, rate: 0.06 },
    },

    payments: {
      januaryDate:        '2026-01-31',
      julyDate:           '2026-07-31',
      onAccountThreshold: 1_000,
    },

    sa103sThreshold: 90_000,
  },

  '2025/26': {
    year:      '2025/26',
    startDate: '2025-04-06',
    endDate:   '2026-04-05',

    mileageRates: [
      { bandSizeMiles: 10_000, ratePerMile: 0.45 },
      { bandSizeMiles: null,   ratePerMile: 0.25 },
    ],

    incomeTax: {
      personalAllowance: 12_570,
      taperThreshold:    100_000,
      bands: [
        { label: 'Basic rate',      from: 0,       to: 37_700,  rate: 0.20 },
        { label: 'Higher rate',     from: 37_700,  to: 112_570, rate: 0.40 },
        { label: 'Additional rate', from: 112_570, to: null,    rate: 0.45 },
      ],
    },

    nationalInsurance: {
      class2: {
        // Class 2 abolished April 2024. Profits ≥ this threshold secure state
        // pension credit automatically. Below it, voluntary Class 2 available.
        smallProfitsThreshold: 6_725,
        weeklyRate:            3.45,
        weeksInYear:           52,
      },
      class4: {
        lowerProfitsLimit: 12_570,
        upperProfitsLimit: 50_270,
        lowerRate:         0.06,
        upperRate:         0.02,
      },
    },

    // Student loan repayment thresholds — verify annually before each tax year
    studentLoans: {
      plan1: { threshold: 24_990, rate: 0.09 },
      plan2: { threshold: 27_295, rate: 0.09 },
      plan4: { threshold: 31_395, rate: 0.09 },
      pgl:   { threshold: 21_000, rate: 0.06 },
    },

    payments: {
      januaryDate:        '2027-01-31',
      julyDate:           '2027-07-31',
      onAccountThreshold: 1_000,
    },

    sa103sThreshold: 90_000,
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
