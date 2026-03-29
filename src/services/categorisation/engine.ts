import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from '@/lib/claude'
import { supabase } from '@/lib/supabase'
import {
  TRANSACTION_CATEGORIES,
  type BusinessType,
  type CategoryRule,
  type CategorizationResult,
  type ClientContext,
  type Transaction,
  type TransactionCategory,
} from '@/types/transaction'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum confidence for a cached rule to be used without calling Claude */
const RULE_CONFIDENCE_THRESHOLD = 80

const MODEL = 'claude-sonnet-4-20250514'

// ─── Zod schema for Claude's structured response ─────────────────────────────

const ClaudeCategorizationSchema = z.object({
  category: z.enum(TRANSACTION_CATEGORIES),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
})

// ─── Supabase helpers ─────────────────────────────────────────────────────────

/**
 * Look up a cached rule for this merchant + business type.
 *
 * Supabase table required:
 *   category_rules (
 *     id           uuid primary key default gen_random_uuid(),
 *     merchant     text not null,
 *     business_type text not null,
 *     category     text not null,
 *     confidence   integer not null,
 *     created_at   timestamptz default now(),
 *     unique (merchant, business_type)
 *   )
 */
async function lookupRule(
  merchant: string,
  businessType: BusinessType,
): Promise<CategoryRule | null> {
  const { data, error } = await supabase
    .from('category_rules')
    .select('*')
    .ilike('merchant', merchant)
    .eq('business_type', businessType)
    .order('confidence', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[categorisation] Supabase lookup failed:', error.message)
    return null
  }
  if (!data) return null

  return {
    id: data.id,
    merchant: data.merchant,
    category: data.category as TransactionCategory,
    confidence: data.confidence,
    businessType: data.business_type as BusinessType,
    createdAt: data.created_at,
  }
}

/**
 * Upsert a categorisation result into the rules table so it can be
 * served from cache on future calls for the same merchant.
 */
async function saveRule(
  merchant: string,
  businessType: BusinessType,
  category: TransactionCategory,
  confidence: number,
): Promise<void> {
  const { error } = await supabase.from('category_rules').upsert(
    {
      merchant: merchant.toLowerCase(),
      business_type: businessType,
      category,
      confidence,
    },
    { onConflict: 'merchant,business_type' },
  )

  if (error) {
    console.warn('[categorisation] Supabase save failed:', error.message)
  }
}

// ─── Claude helper ────────────────────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<TransactionCategory, string> = {
  fuel: 'Fuel, oil, AdBlue, or other vehicle running costs',
  materials: 'Parts, components, or consumables used directly on jobs',
  tools: 'Tools, equipment, or machinery purchased for the business',
  insurance: 'Public liability, vehicle, trade, or tool insurance',
  software: 'Software subscriptions, apps, or digital services',
  subcontractor: 'Payments to other tradespeople or labour contractors',
  income: 'Money received from customers for work completed',
  other: 'A legitimate business expense that does not fit the above',
}

function buildSystemPrompt(businessType: BusinessType): string {
  const tradeLabel = businessType === 'mechanic' ? 'motor mechanic' : 'plumber'
  return [
    `You are an expert UK accountant helping a self-employed ${tradeLabel} (sole trader)`,
    'categorise bank transactions for their annual Self Assessment tax return.',
    '',
    'HMRC expense categories in use:',
    ...Object.entries(CATEGORY_DESCRIPTIONS).map(
      ([k, v]) => `  ${k}: ${v}`,
    ),
    '',
    'Rules:',
    '- Positive amounts are income; negative amounts are expenses.',
    '- When in doubt, prefer a specific category over "other".',
    '- Confidence reflects how certain you are given only the merchant name and amount.',
    '- Provide brief reasoning (1–2 sentences) to help the user understand the decision.',
  ].join('\n')
}

function buildUserMessage(transaction: Transaction): string {
  const sign = transaction.amount >= 0 ? '+' : ''
  return [
    'Categorise this transaction:',
    `  Merchant : ${transaction.merchant}`,
    `  Amount   : ${sign}£${Math.abs(transaction.amount).toFixed(2)}`,
    `  Date     : ${transaction.date}`,
  ].join('\n')
}

async function categoriseWithClaude(
  transaction: Transaction,
  context: ClientContext,
): Promise<{ category: TransactionCategory; confidence: number }> {
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 512,
    system: buildSystemPrompt(context.businessType),
    messages: [{ role: 'user', content: buildUserMessage(transaction) }],
    output_config: {
      format: zodOutputFormat(ClaudeCategorizationSchema),
    },
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(
      `[categorisation] Claude returned unparseable output (stop_reason: ${response.stop_reason})`,
    )
  }

  return { category: parsed.category, confidence: parsed.confidence }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Categorise a single bank transaction.
 *
 * 1. Checks the Supabase `category_rules` table for a cached result.
 * 2. Falls back to Claude (claude-opus-4-6) if no confident rule exists.
 * 3. Saves the AI result back to the rules table for future requests.
 *
 * @throws if the Claude API call fails
 */
export async function categoriseTransaction(
  transaction: Transaction,
  context: ClientContext,
): Promise<CategorizationResult> {
  // 1. Rules cache
  const cached = await lookupRule(transaction.merchant, context.businessType)
  if (cached && cached.confidence >= RULE_CONFIDENCE_THRESHOLD) {
    return {
      category: cached.category,
      confidence: cached.confidence,
      source: 'rules',
    }
  }

  // 2. AI fallback
  const { category, confidence } = await categoriseWithClaude(
    transaction,
    context,
  )

  // 3. Persist for next time
  await saveRule(transaction.merchant, context.businessType, category, confidence)

  return { category, confidence, source: 'ai' }
}
