import type { Transaction } from '@/types/transaction'
import type { ExtractedReceipt } from '@/services/ocr/receipt'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnnotatedReceiptTransaction extends Transaction {
  /** Whether this bank transaction was matched to an uploaded receipt. */
  matchSource: 'receipt' | 'receipt-uncertain' | 'unmatched'
  /**
   * The extracted receipt this transaction was matched to.
   * Only present when matchSource !== 'unmatched'.
   */
  matchedReceipt?: ExtractedReceipt
  /**
   * Composite match score (0–1). Present when matchSource !== 'unmatched'.
   * Below CONFIDENT_THRESHOLD the match is flagged as uncertain.
   */
  matchScore?: number
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

// ─── Tolerances & weights ─────────────────────────────────────────────────────

const AMOUNT_TOLERANCE = 2   // ±£2
const DATE_TOLERANCE   = 3   // ±3 calendar days

/** Minimum composite score (0–1) for a pairing to be considered valid. */
const SCORE_THRESHOLD = 0.25

/** Score below which a match is flagged as uncertain (needs user review). */
const CONFIDENT_THRESHOLD = 0.6

/** Relative importance of each signal in the composite score. */
const WEIGHTS = { amount: 0.5, date: 0.2, merchant: 0.3 }

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

/**
 * Tokenise a string into a set of normalised words (uppercase, alphanumeric
 * only, 2+ characters). Used for merchant name comparison.
 */
function tokenise(s: string): Set<string> {
  return new Set(
    s
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= 2),
  )
}

/**
 * Jaccard similarity between the token sets of two strings (0–1).
 * Returns 0 if both strings produce no tokens.
 */
function merchantSimilarity(a: string, b: string): number {
  const ta = tokenise(a)
  const tb = tokenise(b)
  if (ta.size === 0 && tb.size === 0) return 0
  const intersection = [...ta].filter((t) => tb.has(t)).length
  const union = new Set([...ta, ...tb]).size
  return intersection / union
}

/**
 * Composite match score (0–1) for a receipt/transaction pair.
 * Returns null if the hard amount or date limits are exceeded.
 */
function scoreMatch(
  receipt: ExtractedReceipt,
  tx: AnnotatedReceiptTransaction,
): number | null {
  const aDiff = amountDiff(Math.abs(tx.amount), receipt.amount)
  const dDiff = daysDiff(tx.date, receipt.date)

  if (aDiff > AMOUNT_TOLERANCE || dDiff > DATE_TOLERANCE) return null

  const amountScore   = 1 - aDiff / AMOUNT_TOLERANCE
  const dateScore     = 1 - dDiff / DATE_TOLERANCE
  // Compare receipt merchant against both the transaction merchant field and
  // the full description, taking the better of the two.
  const txMerchant    = tx.merchant ?? ''
  const merchantScore = Math.max(
    merchantSimilarity(receipt.merchant, txMerchant),
    merchantSimilarity(receipt.merchant, tx.description),
  )

  return (
    WEIGHTS.amount   * amountScore +
    WEIGHTS.date     * dateScore +
    WEIGHTS.merchant * merchantScore
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Match a list of extracted receipts against bank transactions.
 *
 * Only bank expenses (amount < 0) are considered as candidates — receipts
 * represent money spent, not income.
 *
 * Scoring uses a composite of amount closeness, date closeness, and merchant
 * name similarity. The globally optimal set of pairings is found by solving
 * the assignment greedily on a pre-built score matrix (highest score first),
 * so no transaction is stolen by a weaker match before a better one is tried.
 *
 * A pairing must exceed SCORE_THRESHOLD to be accepted.
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

  const expenseIndices = annotated
    .map((_, i) => i)
    .filter((i) => annotated[i].amount < 0)

  // Build a flat list of all valid (receipt, transaction) pairings with scores
  const candidates: Array<{ receiptIdx: number; txIdx: number; score: number }> = []

  for (let ri = 0; ri < receipts.length; ri++) {
    for (const ti of expenseIndices) {
      const score = scoreMatch(receipts[ri], annotated[ti])
      if (score !== null && score >= SCORE_THRESHOLD) {
        candidates.push({ receiptIdx: ri, txIdx: ti, score })
      }
    }
  }

  // Sort highest score first so the best pairings are assigned first
  candidates.sort((a, b) => b.score - a.score)

  const matchedReceipts = new Set<number>()
  const matchedTxs      = new Set<number>()

  for (const { receiptIdx, txIdx, score } of candidates) {
    if (matchedReceipts.has(receiptIdx) || matchedTxs.has(txIdx)) continue
    annotated[txIdx].matchSource    = score >= CONFIDENT_THRESHOLD ? 'receipt' : 'receipt-uncertain'
    annotated[txIdx].matchedReceipt = receipts[receiptIdx]
    annotated[txIdx].matchScore     = score
    matchedReceipts.add(receiptIdx)
    matchedTxs.add(txIdx)
  }

  const unmatchedReceipts: UnmatchedReceipt[] = receipts
    .map((receipt, ri) => {
      if (matchedReceipts.has(ri)) return null
      return {
        receipt,
        reason:
          `No bank expense found within ±£${AMOUNT_TOLERANCE} and ` +
          `±${DATE_TOLERANCE} days of ${receipt.date} ` +
          `(expected £${receipt.amount.toFixed(2)} at ${receipt.merchant})`,
      }
    })
    .filter((r): r is UnmatchedReceipt => r !== null)

  return { transactions: annotated, unmatchedReceipts }
}
