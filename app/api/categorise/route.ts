import { categoriseTransaction } from '@/services/categorisation/engine'
import type { BusinessType, CategorizationResult, Transaction } from '@/types/transaction'
import type { ProcessedRow } from '@/app/dashboard/actions'

export async function POST(request: Request): Promise<Response> {
  const { transactions, businessType }: { transactions: Transaction[]; businessType: BusinessType } =
    await request.json()

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
