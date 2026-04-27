import test from 'node:test'
import assert from 'node:assert/strict'

import { applyMemory } from '../app/dashboard/helpers.ts'

test('applyMemory promotes matching transactions to approved memory results', () => {
  const transactions = [
    {
      id: 'tx_1',
      date: '2025-04-07',
      description: 'SHELL DIESEL MANCHESTER',
      merchant: 'Shell',
      amount: -45.67,
      category: 'other',
      confidence: 42,
      source: 'ai',
      reasoning: 'Low confidence fallback',
      matchSource: 'unmatched',
      reviewReason: 'Low confidence',
      status: 'flagged',
    },
    {
      id: 'tx_2',
      date: '2025-04-08',
      description: 'CLIENT LTD PAYMENT',
      merchant: 'Client Ltd',
      amount: 250,
      category: 'income',
      confidence: 95,
      source: 'ai',
      reasoning: 'Income payment',
      matchSource: 'unmatched',
      status: 'approved',
    },
  ]
  const memory = new Map([
    ['SHELL.*DIESEL', { category: 'fuel', pattern: 'SHELL.*DIESEL' }],
  ])

  const result = applyMemory(transactions, memory)

  assert.equal(result[0].category, 'fuel')
  assert.equal(result[0].confidence, 99)
  assert.equal(result[0].source, 'memory')
  assert.equal(result[0].status, 'approved')
  assert.equal(result[0].reviewReason, undefined)
  assert.equal(result[0].matchedPattern, 'SHELL.*DIESEL')
  assert.equal(result[1], transactions[1])
})

test('applyMemory ignores invalid stored regex patterns', () => {
  const transactions = [{
    id: 'tx_1',
    date: '2025-04-07',
    description: 'SHELL DIESEL MANCHESTER',
    merchant: 'Shell',
    amount: -45.67,
    category: 'other',
    confidence: 42,
    source: 'ai',
    reasoning: 'Low confidence fallback',
    matchSource: 'unmatched',
    reviewReason: 'Low confidence',
    status: 'flagged',
  }]
  const memory = new Map([
    ['[invalid', { category: 'fuel', pattern: '[invalid' }],
  ])

  assert.deepEqual(applyMemory(transactions, memory), transactions)
})
