import type { Transaction } from '@/types/transaction'
import type { UberWeeklyRow } from '@/services/platformFeed/uber'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnnotatedTransaction extends Transaction {
  /** Whether this bank transaction was matched to a platform payout. */
  matchSource: 'platform' | 'unmatched'
  /**
   * The platform payout row this transaction was matched to.
   * Only present when matchSource === 'platform'.
   */
  matchedRow?: UberWeeklyRow
}

export interface UnmatchedPayout {
  row: UberWeeklyRow
  reason: string
}

export interface PlatformMatchResult {
  /** Every bank transaction, annotated with match data. */
  transactions: AnnotatedTransaction[]
  /** Platform payouts for which no bank credit was found within tolerance. */
  unmatchedPayouts: UnmatchedPayout[]
}

// ─── Tolerances ───────────────────────────────────────────────────────────────

const AMOUNT_TOLERANCE = 2    // ±£2
const DATE_TOLERANCE   = 3    // ±3 calendar days

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Absolute difference between two GBP amounts, rounded to 2 decimal places
 * before subtracting to avoid IEEE 754 floating point drift near the tolerance
 * boundary (e.g. 0.1 + 0.2 === 0.30000000000000004 in JavaScript).
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
  const dateA = Date.UTC(
    parseInt(a.slice(0, 4)),
    parseInt(a.slice(5, 7)) - 1,
    parseInt(a.slice(8, 10)),
  )
  const dateB = Date.UTC(
    parseInt(b.slice(0, 4)),
    parseInt(b.slice(5, 7)) - 1,
    parseInt(b.slice(8, 10)),
  )
  return Math.abs(dateA - dateB) / msPerDay
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Match a list of platform payout rows against bank transactions.
 *
 * A bank credit is a candidate match for a payout if:
 *   - |credit.amount − payout.netEarnings| ≤ £2  (AMOUNT_TOLERANCE)
 *   - |daysBetween(credit.date, payout.payoutDate)| ≤ 3  (DATE_TOLERANCE)
 *
 * Among candidates, the one with the smallest amount difference wins.
 * Date proximity is used as a tiebreak when amount differences are equal.
 *
 * Each bank credit can only be matched once — once consumed it is not
 * considered for subsequent payouts.
 *
 * Bank transactions that are not credits (amount ≤ 0) are passed through
 * with matchSource 'unmatched' and are never considered as candidates.
 *
 * @param payouts      Normalised payout rows from a platform parser
 * @param transactions Raw bank transactions from the bank feed parser
 * @returns            Annotated transactions + list of unmatched payouts
 */
export function matchPlatformPayouts(
  payouts: UberWeeklyRow[],
  transactions: Transaction[],
): PlatformMatchResult {
  // Annotate every transaction as unmatched to start; track by index
  const annotated: AnnotatedTransaction[] = transactions.map((t) => ({
    ...t,
    matchSource: 'unmatched',
  }))

  // Only credits are eligible — track which ones are still available
  const availableCredits = new Set(
    annotated
      .map((_, i) => i)
      .filter((i) => annotated[i].amount > 0),
  )

  const unmatchedPayouts: UnmatchedPayout[] = []

  for (const payout of payouts) {
    let bestIndex: number | null = null
    let bestAmountDiff = Infinity
    let bestDateDiff = Infinity

    for (const i of availableCredits) {
      const tx = annotated[i]
      const aDiff = amountDiff(tx.amount, payout.netEarnings)
      const dDiff = daysDiff(tx.date, payout.payoutDate)

      if (aDiff > AMOUNT_TOLERANCE || dDiff > DATE_TOLERANCE) continue

      // Prefer smallest amount diff; use date diff as tiebreak
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
      annotated[bestIndex].matchSource = 'platform'
      annotated[bestIndex].matchedRow  = payout
      availableCredits.delete(bestIndex)
    } else {
      unmatchedPayouts.push({
        row: payout,
        reason:
          `No bank credit found within ±£${AMOUNT_TOLERANCE} and ` +
          `±${DATE_TOLERANCE} days of ${payout.payoutDate} ` +
          `(expected £${payout.netEarnings.toFixed(2)})`,
      })
    }
  }

  return { transactions: annotated, unmatchedPayouts }
}
