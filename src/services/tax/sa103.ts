import type { TransactionCategory } from '@/types/transaction'

// ─── SA103 Expense Config ─────────────────────────────────────────────────────
//
// Maps each transaction category to its HMRC SA103F description and whether
// it is a vehicle expense (subject to the actual vs mileage comparison).
//
// To add a new category: add an entry here matching the TransactionCategory
// union. The calculator reads isVehicle to split the totals correctly.

export interface SA103ExpenseConfig {
  /** Short label shown in the UI */
  label: string
  /** Official HMRC wording from the SA103F form */
  hmrcDescription: string
  /**
   * True only for the fuel/motor category.
   * Vehicle expenses are excluded from nonVehicleExpenses and handled
   * separately via the actual vs mileage comparison.
   */
  isVehicle: boolean
}

export const SA103_EXPENSE_CONFIG: Partial<Record<TransactionCategory, SA103ExpenseConfig>> = {
  fuel: {
    label:           'Motor expenses',
    hmrcDescription: 'Car, van and travel expenses',
    isVehicle:       true,
  },
  materials: {
    label:           'Materials / cost of goods',
    hmrcDescription: 'Cost of goods bought for resale or goods used',
    isVehicle:       false,
  },
  tools: {
    label:           'Tools and equipment',
    hmrcDescription: 'Repairs and renewals of property and equipment',
    isVehicle:       false,
  },
  insurance: {
    label:           'Insurance',
    hmrcDescription: 'Rent, rates, power and insurance costs',
    isVehicle:       false,
  },
  software: {
    label:           'Software and IT',
    hmrcDescription: 'Phone, fax, stationery and other office costs',
    isVehicle:       false,
  },
  subcontractor: {
    label:           'Subcontractors',
    hmrcDescription: 'Wages, salaries and other staff costs',
    isVehicle:       false,
  },
  other: {
    label:           'Other expenses',
    hmrcDescription: 'Other allowable business expenses',
    isVehicle:       false,
  },
}
