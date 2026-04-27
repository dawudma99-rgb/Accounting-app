import test from 'node:test'
import assert from 'node:assert/strict'

import { parseMonzoCSV } from '../src/services/bankFeed/index.ts'

const header = [
  'Transaction ID',
  'Date',
  'Time',
  'Type',
  'Name',
  'Emoji',
  'Category',
  'Amount',
  'Currency',
  'Local amount',
  'Local currency',
  'Notes and #tags',
  'Address',
  'Receipt',
  'Description',
  'Category split',
  'Money Out',
  'Money In',
].join(',')

function row(fields) {
  return fields.map((field) => {
    const value = String(field)
    return value.includes(',') ? `"${value.replaceAll('"', '""')}"` : value
  }).join(',')
}

test('parseMonzoCSV returns normalized transactions and skips zero amounts', () => {
  const csv = [
    header,
    row(['tx_1', '07/04/2025', '09:00', 'Card', 'Shell, Station', '', 'Transport', '-45.67', 'GBP', '', '', '', '', '', 'SHELL DIESEL MANCHESTER', '', '', '']),
    row(['tx_2', '08/04/2025', '10:00', 'Card', 'Pot Transfer', '', 'General', '0', 'GBP', '', '', '', '', '', 'POT TRANSFER', '', '', '']),
    row(['tx_3', '09/04/2025', '11:00', 'Bank transfer', 'Client Ltd', '', 'Income', '250.00', 'GBP', '', '', '', '', '', 'CLIENT LTD PAYMENT', '', '', '']),
  ].join('\n')

  const result = parseMonzoCSV(csv)

  assert.equal(result.skipped, 1)
  assert.deepEqual(result.warnings, [])
  assert.deepEqual(result.transactions, [
    {
      description: 'SHELL DIESEL MANCHESTER',
      amount: -45.67,
      date: '2025-04-07',
      merchant: 'Shell, Station',
    },
    {
      description: 'CLIENT LTD PAYMENT',
      amount: 250,
      date: '2025-04-09',
      merchant: 'Client Ltd',
    },
  ])
})

test('parseMonzoCSV rejects files without Monzo headers', () => {
  assert.throws(
    () => parseMonzoCSV('Date,Description,Amount\n2025-04-07,SHELL,-45.67'),
    /Missing headers/,
  )
})
