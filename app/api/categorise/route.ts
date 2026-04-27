import { z } from 'zod'
import { categoriseTransaction } from '@/services/categorisation/engine'
import type { BusinessType, CategorizationResult, Transaction } from '@/types/transaction'
import type { ProcessedRow } from '@/app/dashboard/actions'

const MAX_BODY_BYTES = 1_000_000
const MAX_TRANSACTIONS_PER_REQUEST = 100

const TransactionSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount:      z.number().finite(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  merchant:    z.string().trim().min(1).max(200).optional(),
})

const CategoriseRequestSchema = z.object({
  businessType:  z.enum(['mechanic', 'plumber', 'taxi']),
  transactions:  z.array(TransactionSchema).min(1).max(MAX_TRANSACTIONS_PER_REQUEST),
})

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json(
      { error: `Request body too large. Maximum is ${MAX_BODY_BYTES} bytes.` },
      { status: 413 },
    )
  }

  let parsedBody: unknown
  try {
    parsedBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 })
  }

  const validation = CategoriseRequestSchema.safeParse(parsedBody)
  if (!validation.success) {
    return Response.json(
      { error: 'Invalid categorisation request.', details: validation.error.flatten() },
      { status: 400 },
    )
  }

  const { transactions, businessType } = validation.data as {
    transactions: Transaction[]
    businessType: BusinessType
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      try {
        for (const tx of transactions) {
          // Abort cleanly if the client disconnected
          if (request.signal.aborted) break

          let result: CategorizationResult
          try {
            result = await categoriseTransaction(tx, { businessType })
          } catch (err) {
            console.error('[/api/categorise] Failed on transaction:', tx.description, err)
            result = {
              category: 'other',
              confidence: 0,
              source: 'ai',
              reasoning: 'Categorisation failed — please review manually.',
            }
          }

          const row: ProcessedRow = {
            description:    tx.description,
            merchant:       tx.merchant,
            amount:         tx.amount,
            date:           tx.date,
            category:       result.category,
            confidence:     result.confidence,
            source:         result.source,
            reasoning:      result.reasoning ?? '',
            matchedPattern: result.matchedPattern,
          }

          send(row)
        }
      } catch (err) {
        send({ __error: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no', // disable proxy buffering (nginx etc.)
    },
  })
}
