import { z } from 'zod'
import { anthropic } from '@/lib/claude'
import { supabaseServer as supabase } from '@/lib/supabase/server'
import {
  TRANSACTION_CATEGORIES,
  type BusinessType,
  type CategoryRule,
  type CategorizationResult,
  type ClientContext,
  type Transaction,
  type TransactionCategory,
} from '@/types/transaction'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum confidence for a cached rule to be used without calling Claude */
const RULE_CONFIDENCE_THRESHOLD = 80

/** Confidence assigned when a user manually confirms a categorisation */
const CONFIRMED_CONFIDENCE = 99

const MODEL = 'claude-sonnet-4-20250514'

// ─── Zod schema for Claude's structured response ──────────────────────────────

const ClaudeCategorizationSchema = z.object({
  category: z.enum(TRANSACTION_CATEGORIES),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
  /** Regex to match similar transactions in future — stored in the rules table */
  pattern: z.string(),
  /** Typical lower bound for |amount| in £, or null if variable */
  amount_min: z.number().nullable(),
  /** Typical upper bound for |amount| in £, or null if variable */
  amount_max: z.number().nullable(),
})

// ─── Supabase helpers ─────────────────────────────────────────────────────────

/**
 * Find the highest-confidence rule that matches this description and amount,
 * delegating the regex test and amount range check to PostgreSQL via RPC.
 *
 * Uses the ~* operator (case-insensitive regex) server-side so only the single
 * best match is returned — no full table scan in JavaScript.
 */
async function lookupRule(
  description: string,
  businessType: BusinessType,
  amount: number,
): Promise<CategoryRule | null> {
  const { data, error } = await supabase.rpc('match_category_rule', {
    p_description:   description,
    p_business_type: businessType,
    p_amount:        Math.abs(amount),
  })

  if (error) {
    console.warn('[categorisation] Supabase RPC failed:', error.message)
    return null
  }
  if (!data?.length) return null

  const row = data[0]
  return {
    id:           row.id,
    pattern:      row.pattern,
    category:     row.category as TransactionCategory,
    confidence:   row.confidence,
    amountMin:    row.amount_min  ?? undefined,
    amountMax:    row.amount_max  ?? undefined,
    businessType: row.business_type as BusinessType,
    createdAt:    row.created_at,
  }
}

async function saveRule(
  pattern: string,
  businessType: BusinessType,
  category: TransactionCategory,
  confidence: number,
  amountMin?: number,
  amountMax?: number,
): Promise<void> {
  const { error } = await supabase.from('category_rules').upsert(
    {
      pattern,
      business_type: businessType,
      category,
      confidence,
      amount_min: amountMin ?? null,
      amount_max: amountMax ?? null,
    },
    { onConflict: 'pattern,business_type' },
  )

  if (error) {
    console.warn('[categorisation] Supabase save failed:', error.message)
  }
}

// ─── Claude helpers ───────────────────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<TransactionCategory, string> = {
  fuel:          'Fuel, oil, AdBlue, or other vehicle running costs',
  materials:     'Parts, components, or consumables used directly on jobs',
  tools:         'Tools, equipment, or machinery purchased for the business',
  insurance:     'Public liability, vehicle, trade, or tool insurance',
  software:      'Software subscriptions, apps, or digital services',
  subcontractor: 'Payments to other tradespeople or labour contractors',
  income:        'Money received from customers for work completed',
  other:         'A legitimate business expense that does not fit the above',
}

function buildSystemPrompt(businessType: BusinessType): string {
  const tradeLabel =
    businessType === 'mechanic' ? 'motor mechanic' :
    businessType === 'plumber'  ? 'plumber' :
    'self-employed taxi driver'
  return [
    `You are an expert UK accountant helping a self-employed ${tradeLabel} (sole trader)`,
    'categorise bank transactions for their annual Self Assessment tax return.',
    '',
    'HMRC expense categories in use:',
    ...Object.entries(CATEGORY_DESCRIPTIONS).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'Rules:',
    '- Positive amounts are income; negative amounts are expenses.',
    '- When in doubt, prefer a specific category over "other".',
    '- Confidence reflects how certain you are given the full transaction description.',
    '- If receipt text is provided, use it to improve accuracy.',
    '',
    'Respond with a JSON object only — no markdown, no explanation — in this exact shape:',
    '{',
    '  "category": "<category>",',
    '  "confidence": <0-100>,',
    '  "reasoning": "<1-2 sentences>",',
    '  "pattern": "<case-insensitive regex matching similar future descriptions>",',
    '  "amount_min": <typical lower bound for |amount| in £, or null>,',
    '  "amount_max": <typical upper bound for |amount| in £, or null>',
    '}',
    '',
    'For "pattern": write a concise, specific regex. Examples:',
    '  "SHELL.*DIESEL" for diesel at Shell stations',
    '  "\\\\bHALFORDS\\\\b" for any Halfords transaction',
    '  "DIRECT\\\\s+LINE.*INSURANCE" for Direct Line insurance',
    'Avoid overly broad patterns that would match unrelated merchants.',
    '',
    'For amount ranges: give the typical absolute-value £ range for this merchant/type.',
    'Use null for both if amounts vary widely.',
  ].join('\n')
}

function buildUserMessage(transaction: Transaction, receiptText?: string): string {
  const sign = transaction.amount >= 0 ? '+' : ''
  const lines = [
    'Categorise this bank transaction:',
    `  Description : ${transaction.description}`,
    `  Amount      : ${sign}£${Math.abs(transaction.amount).toFixed(2)}`,
    `  Date        : ${transaction.date}`,
  ]
  if (transaction.merchant) {
    lines.push(`  Merchant    : ${transaction.merchant}`)
  }
  if (receiptText?.trim()) {
    lines.push('', '--- Matched receipt (OCR output) ---', receiptText.trim())
  }
  return lines.join('\n')
}

/** Return true if the string compiles as a valid regex. */
function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i')
    return true
  } catch {
    return false
  }
}

/** Escape a plain string so it is safe to embed in a regex. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function categoriseWithClaude(
  transaction: Transaction,
  context: ClientContext,
): Promise<{
  category: TransactionCategory
  confidence: number
  reasoning: string
  pattern: string
  amountMin?: number
  amountMax?: number
}> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: buildSystemPrompt(context.businessType),
    messages: [{ role: 'user', content: buildUserMessage(transaction, context.receiptText) }],
  })

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`[categorisation] Claude returned non-JSON output: ${text}`)
  }

  const result = ClaudeCategorizationSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `[categorisation] Claude JSON failed schema validation: ${result.error.message}`,
    )
  }

  const { category, confidence, reasoning, amount_min, amount_max } = result.data
  let { pattern } = result.data

  // Guard: fall back to a safe literal if Claude produced an invalid regex
  if (!isValidPattern(pattern)) {
    const seed = (
      transaction.merchant?.trim() ||
      transaction.description.trim().split(/\s+/)[0] ||
      'unknown'
    ).toUpperCase()
    pattern = escapeRegex(seed)
    console.warn('[categorisation] Claude pattern was invalid; fell back to:', pattern)
  }

  return {
    category,
    confidence,
    reasoning,
    pattern,
    amountMin: amount_min ?? undefined,
    amountMax: amount_max ?? undefined,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persist a user-confirmed categorisation at 99% confidence.
 *
 * Pass the `matchedPattern` from the original `CategorizationResult` so we
 * update the exact rule that fired. If no pattern is available, generate one
 * from the merchant name.
 *
 * @param pattern      Regex string from CategorizationResult.matchedPattern, or
 *                     escapeRegex(merchant.toUpperCase()) as a fallback.
 * @param businessType Client's trade type.
 * @param category     The category the user confirmed.
 */
export async function confirmRule(
  pattern: string,
  businessType: BusinessType,
  category: TransactionCategory,
): Promise<void> {
  await saveRule(pattern, businessType, category, CONFIRMED_CONFIDENCE)
}

/**
 * Categorise a single bank transaction.
 *
 * 1. Checks hardcoded rules (e.g. DVLA → other).
 * 2. Tests all Supabase rules: each stored regex pattern against the full
 *    description, with optional amount-range filtering.
 * 3. Falls back to Claude with the full description + any receipt OCR text.
 * 4. Saves Claude's suggested pattern back to the rules table for future use.
 *
 * @throws if the Claude API call fails
 */
export async function categoriseTransaction(
  transaction: Transaction,
  context: ClientContext,
): Promise<CategorizationResult> {
  // 1. Supabase rules cache
  const cached = await lookupRule(transaction.description, context.businessType, transaction.amount)
  if (cached && cached.confidence >= RULE_CONFIDENCE_THRESHOLD) {
    return {
      category: cached.category,
      confidence: cached.confidence,
      source: 'rules',
      matchedPattern: cached.pattern,
    }
  }

  // 2. AI fallback
  const { category, confidence, reasoning, pattern, amountMin, amountMax } = await categoriseWithClaude(
    transaction,
    context,
  )

  // 3. Persist pattern for next time
  await saveRule(pattern, context.businessType, category, confidence, amountMin, amountMax)

  return { category, confidence, reasoning, source: 'ai', matchedPattern: pattern }
}
