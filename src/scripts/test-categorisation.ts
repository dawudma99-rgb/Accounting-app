/**
 * Test script for the categorisation engine.
 *
 * Run with:
 *   npx tsx --env-file=.env.local src/scripts/test-categorisation.ts
 *
 * The engine result (category, confidence, source) comes from categoriseTransaction.
 * Reasoning is fetched via a second Claude call because the engine discards it —
 * this overhead is acceptable in a dev test script.
 */

import { z } from 'zod'
import { anthropic } from '../lib/claude'
import { categoriseTransaction } from '../services/categorisation/engine'
import {
  TRANSACTION_CATEGORIES,
  type CategorizationResult,
  type Transaction,
} from '../types/transaction'

// ─── Sample transactions ──────────────────────────────────────────────────────

const TRANSACTIONS: Transaction[] = [
  { description: 'HALFORDS AUTO CENTRES STRATFORD 87.49 01MAR',      merchant: 'Halfords',              amount: -87.49,   date: '2026-03-01' },
  { description: 'SHELL 8327 ROMFORD DIESEL 094.20 03MAR',           merchant: 'Shell',                 amount: -94.20,   date: '2026-03-03' },
  { description: 'DIRECT LINE INSURANCE ANNUAL PREM DD 1240.00',     merchant: 'Direct Line',           amount: -1240.00, date: '2026-03-04' },
  { description: 'SNAP-ON TOOLS LTD KEIGHLEY 319.99 05MAR',          merchant: 'Snap-on Tools',         amount: -319.99,  date: '2026-03-05' },
  { description: 'EURO CAR PARTS LTD ROMFORD 152.30 07MAR',          merchant: 'Euro Car Parts',        amount: -152.30,  date: '2026-03-07' },
  { description: 'DVLA VEHICLE TAX VRN AB12CDE 299.00 10MAR',        merchant: 'DVLA Vehicle Tax',      amount: -299.00,  date: '2026-03-10' },
  { description: 'BP CONNECT CHADWELL HEATH 78.60 12MAR',            merchant: 'BP',                    amount: -78.60,   date: '2026-03-12' },
  { description: 'GARAGESOFT PRO MONTHLY SUBSCRIPTION 29.99 14MAR',  merchant: 'GarageSoft Pro',        amount: -29.99,   date: '2026-03-14' },
  { description: 'AUTOSPARKS ELECTRICAL LTD INVOICE 3847 450.00',    merchant: 'AutoSparks Electrical', amount: -450.00,  date: '2026-03-18' },
  { description: 'BACS DAVIES AUTOS FORD FOCUS SERVICE JOB 320.00',  merchant: 'Davies Autos Customer', amount: 320.00,   date: '2026-03-20' },
]

const CONTEXT = { businessType: 'mechanic' as const }

// ─── Claude schema (mirrors engine internals, adds reasoning) ─────────────────

const ReasoningSchema = z.object({
  category: z.enum(TRANSACTION_CATEGORIES),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
})

const AUTO_APPROVE_THRESHOLD = 80

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are an expert UK accountant helping a self-employed motor mechanic (sole trader)',
    'categorise bank transactions for their annual Self Assessment tax return.',
    '',
    'HMRC expense categories in use:',
    '  fuel: Fuel, oil, AdBlue, or other vehicle running costs',
    '  materials: Parts, components, or consumables used directly on jobs',
    '  tools: Tools, equipment, or machinery purchased for the business',
    '  insurance: Public liability, vehicle, trade, or tool insurance',
    '  software: Software subscriptions, apps, or digital services',
    '  subcontractor: Payments to other tradespeople or labour contractors',
    '  income: Money received from customers for work completed',
    '  other: A legitimate business expense that does not fit the above',
    '',
    'Rules:',
    '- Positive amounts are income; negative amounts are expenses.',
    '- When in doubt, prefer a specific category over "other".',
    '- Confidence reflects how certain you are given only the merchant name and amount.',
    '- Provide brief reasoning (1–2 sentences) to help the user understand the decision.',
  ].join('\n')
}

function buildUserMessage(t: Transaction): string {
  const sign = t.amount >= 0 ? '+' : ''
  const lines = [
    'Categorise this transaction:',
    `  Description : ${t.description}`,
    `  Amount      : ${sign}£${Math.abs(t.amount).toFixed(2)}`,
    `  Date        : ${t.date}`,
  ]
  if (t.merchant) lines.push(`  Merchant    : ${t.merchant}`)
  return lines.join('\n')
}

async function getReasoning(t: Transaction): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system:
      buildSystemPrompt() +
      '\n\nRespond with a JSON object only — no markdown, no explanation — in this exact shape:\n' +
      '{"category":"<category>","confidence":<0-100>,"reasoning":"<1-2 sentences>"}',
    messages: [{ role: 'user', content: buildUserMessage(t) }],
  })

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  try {
    const parsed = ReasoningSchema.parse(JSON.parse(text))
    return parsed.reasoning
  } catch {
    return '(could not parse reasoning)'
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function printResult(
  t: Transaction,
  result: CategorizationResult,
  reasoning: string,
  index: number,
): void {
  const autoApproved = result.confidence >= AUTO_APPROVE_THRESHOLD
  const flag = autoApproved ? '✓' : '⚠'
  const sign = t.amount >= 0 ? '+' : ''

  console.log(`\n${index + 1}. ${flag} ${t.merchant ?? t.description}`)
  console.log(`   Amount     : ${sign}£${Math.abs(t.amount).toFixed(2)}`)
  console.log(`   Category   : ${pad(result.category, 14)} (${result.confidence}% confidence)`)
  console.log(`   Source     : ${result.source}`)
  console.log(`   Reasoning  : ${reasoning}`)
  if (!autoApproved) {
    console.log('   ** FLAGGED FOR REVIEW (confidence below threshold) **')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═'.repeat(60))
  console.log(' Categorisation Engine Test — 10 Mechanic Transactions')
  console.log('═'.repeat(60))

  let autoApproved = 0
  let flagged = 0

  for (let i = 0; i < TRANSACTIONS.length; i++) {
    const t = TRANSACTIONS[i]

    // Run through the engine (uses Supabase cache → Claude fallback)
    const result = await categoriseTransaction(t, CONTEXT)

    // Fetch reasoning via a direct Claude call (engine discards it internally)
    const reasoning =
      result.source === 'rules'
        ? '(served from cache — reasoning not stored)'
        : await getReasoning(t)

    printResult(t, result, reasoning, i)

    if (result.confidence >= AUTO_APPROVE_THRESHOLD) {
      autoApproved++
    } else {
      flagged++
    }
  }

  console.log('\n' + '═'.repeat(60))
  console.log(' Summary')
  console.log('─'.repeat(60))
  console.log(`  Total transactions : ${TRANSACTIONS.length}`)
  console.log(`  Auto-approved (≥${AUTO_APPROVE_THRESHOLD}%): ${autoApproved}`)
  console.log(`  Flagged for review : ${flagged}`)
  console.log('═'.repeat(60))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})