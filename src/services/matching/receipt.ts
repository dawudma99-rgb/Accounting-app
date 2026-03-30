import type { Transaction } from '@/types/transaction'
import type { ExtractedReceipt } from '@/services/ocr/receipt'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnnotatedReceiptTransaction extends Transaction {
  /** Whether this bank transaction was matched to an uploaded receipt. */
  matchSource: 'receipt' | 'unmatched'
  /**
   * The extracted receipt this transaction was matched to.
   * Only present when matchSource === 'receipt'.
   */
  matchedReceipt?: ExtractedReceipt
}

export interface UnmatchedReceipt {
  receipt: ExtractedReceipt
  reason: string
}

export interface ReceiptMatchResult {
  /** Every bank transaction, annotated with receipt match data. */
  transactions: AnnotatedReceiptTransaction[]
  /** Receipts for which no bank expense was found within tolerance. */
  unmatchedReceipts: UnmatchedReceipt[]
}

// ─── Tolerances ───────────────────────────────────────────────────────────────

const AMOUNT_TOLERANCE = 2   // ±£2
const DATE_TOLERANCE   = 3   // ±3 calendar days

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Absolute difference between two GBP amounts, rounded to 2 decimal places
 * to avoid IEEE 754 floating point drift near the tolerance boundary.
 */
function amountDiff(a: number, b: number): number {
  const rounded = (n: number) => Math.round(n * 100) / 100
  return Math.abs(rounded(a) - rounded(b))
}

/**
 * Absolute difference in calendar days between two ISO 8601 date strings.
 * Uses UTC midnight to avoid DST shifts.
 */
function daysDiff(a: string, b: string): number {
  const msPerDay = 86_400_000
  const toUtc = (iso: string) =>
    Date.UTC(
      parseInt(iso.slice(0, 4)),
      parseInt(iso.slice(5, 7)) - 1,
      parseInt(iso.slice(8, 10)),
    )
  return Math.abs(toUtc(a) - toUtc(b)) / msPerDay
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Match a list of extracted receipts against bank transactions.
 *
 * Only bank expenses (amount < 0) are considered as candidates — receipts
 * represent money spent, not income.
 *
 * A bank expense is a candidate match for a receipt if:
 *   - |expense.amount| is within ±£2 of receipt.amount  (AMOUNT_TOLERANCE)
 *   - |daysBetween(expense.date, receipt.date)| ≤ 3      (DATE_TOLERANCE)
 *
 * Among candidates, the one with the smallest amount difference wins.
 * Date proximity is used as a tiebreak when amount differences are equal.
 *
 * Each bank expense can only be matched to one receipt — once consumed it is
 * not considered for subsequent receipts.
 *
 * @param receipts      Extracted receipt data from the OCR service
 * @param transactions  Raw bank transactions from the bank feed parser
 * @returns             Annotated transactions + list of unmatched receipts
 */
export function matchReceiptTransactions(
  receipts: ExtractedReceipt[],
  transactions: Transaction[],
): ReceiptMatchResult {
  const annotated: AnnotatedReceiptTransaction[] = transactions.map((t) => ({
    ...t,
    matchSource: 'unmatched',
  }))

  // Only expenses (negative amounts) can be matched to receipts
  const availableExpenses = new Set(
    annotated
      .map((_, i) => i)
      .filter((i) => annotated[i].amount < 0),
  )

  const unmatchedReceipts: UnmatchedReceipt[] = []

  for (const receipt of receipts) {
    let bestIndex:      number | null = null
    let bestAmountDiff  = Infinity
    let bestDateDiff    = Infinity

    for (const i of availableExpenses) {
      const tx     = annotated[i]
      const aDiff  = amountDiff(Math.abs(tx.amount), receipt.amount)
      const dDiff  = daysDiff(tx.date, receipt.date)

      if (aDiff > AMOUNT_TOLERANCE || dDiff > DATE_TOLERANCE) continue

      if (
        aDiff < bestAmountDiff ||
        (aDiff === bestAmountDiff && dDiff < bestDateDiff)
      ) {
        bestIndex      = i
        bestAmountDiff = aDiff
        bestDateDiff   = dDiff
      }
    }

    if (bestIndex !== null) {
      annotated[bestIndex].matchSource     = 'receipt'
      annotated[bestIndex].matchedReceipt  = receipt
      availableExpenses.delete(bestIndex)
    } else {
      unmatchedReceipts.push({
        receipt,
        reason:
          `No bank expense found within ±£${AMOUNT_TOLERANCE} and ` +
          `±${DATE_TOLERANCE} days of ${receipt.date} ` +
          `(expected £${receipt.amount.toFixed(2)} at ${receipt.merchant})`,
      })
    }
  }

  return { transactions: annotated, unmatchedReceipts }
}
