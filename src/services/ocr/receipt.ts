import { z } from 'zod'
import { anthropic } from '@/lib/claude'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Media types Claude Vision accepts for receipt images. */
export const SUPPORTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

/** Structured data extracted from a single receipt image. */
export interface ExtractedReceipt {
  /** Original file name — used for warnings and UI display. */
  fileName: string
  /** Merchant or business name as it appears on the receipt. */
  merchant: string
  /** Total amount paid in GBP. Always positive. */
  amount: number
  /** Date of purchase in ISO 8601 format (YYYY-MM-DD). */
  date: string
  /** 0–100: how clearly readable the receipt was. */
  confidence: number
}

export interface OcrParseResult {
  receipts: ExtractedReceipt[]
  /** Files that could not be parsed — blurry, wrong format, unreadable. */
  failed: Array<{ fileName: string; reason: string }>
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const ReceiptSchema = z.object({
  merchant:   z.string().min(1),
  amount:     z.number().positive(),
  /** Claude returns date in ISO 8601 YYYY-MM-DD as instructed in the prompt. */
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  confidence: z.number().int().min(0).max(100),
})

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You are an assistant that extracts structured data from receipt images.',
  'The receipts are from UK businesses and amounts are in GBP (£).',
  '',
  'Extract the following fields:',
  '  merchant   — the business name shown on the receipt',
  '  amount     — the total amount paid (positive number, GBP, no currency symbol)',
  '  date       — the date of purchase in ISO 8601 format YYYY-MM-DD',
  '  confidence — integer 0–100 reflecting how clearly readable the receipt is',
  '               (100 = perfectly clear, 0 = completely unreadable)',
  '',
  'Rules:',
  '- Use the TOTAL amount (including VAT if shown), not subtotals or line items.',
  '- If the date is ambiguous (e.g. only month and year), use the first day of the month.',
  '- If you cannot determine a field with any confidence, still return your best guess',
  '  and set confidence accordingly.',
  '',
  'Respond with a JSON object only — no markdown, no explanation:',
  '{ "merchant": "...", "amount": 0.00, "date": "YYYY-MM-DD", "confidence": 0 }',
].join('\n')

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract structured receipt data from a batch of base64-encoded images using
 * Claude Vision. Each image is processed independently. Failures are collected
 * in `result.failed` rather than throwing, so one bad image doesn't abort the
 * whole batch.
 *
 * @param files  Array of base64-encoded image data with metadata
 * @returns      Extracted receipts and any files that failed
 */
export async function extractReceiptsFromImages(
  files: Array<{ base64: string; mediaType: string; fileName: string }>,
): Promise<OcrParseResult> {
  const receipts: ExtractedReceipt[] = []
  const failed:   OcrParseResult['failed'] = []

  for (const file of files) {
    if (!SUPPORTED_MEDIA_TYPES.includes(file.mediaType as SupportedMediaType)) {
      failed.push({
        fileName: file.fileName,
        reason:   `Unsupported file type: ${file.mediaType}. Use JPEG, PNG, GIF, or WebP.`,
      })
      continue
    }

    let raw: string
    try {
      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 256,
        system:     SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type:   'image',
              source: {
                type:       'base64',
                media_type: file.mediaType as SupportedMediaType,
                data:       file.base64,
              },
            },
            {
              type: 'text',
              text: 'Extract the receipt details from this image.',
            },
          ],
        }],
      })

      const block = response.content[0]
      if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
      raw = block.text.trim()
    } catch (err) {
      failed.push({
        fileName: file.fileName,
        reason:   `Claude Vision call failed: ${(err as Error).message}`,
      })
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      failed.push({
        fileName: file.fileName,
        reason:   'Claude returned invalid JSON — receipt may be unreadable.',
      })
      continue
    }

    const result = ReceiptSchema.safeParse(parsed)
    if (!result.success) {
      failed.push({
        fileName: file.fileName,
        reason:   `Could not extract receipt data: ${result.error.message}`,
      })
      continue
    }

    receipts.push({
      fileName:   file.fileName,
      merchant:   result.data.merchant,
      amount:     result.data.amount,
      date:       result.data.date,
      confidence: result.data.confidence,
    })
  }

  return { receipts, failed }
}
