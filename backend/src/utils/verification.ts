import type { OcrResult } from '../types';

const AMOUNT_EPSILON = 0.01;

/**
 * The single "is this bill legit" rule, applied once per bill as part of the
 * upload transaction's own background OCR step (see routes/bills.ts) -- not
 * as a side effect of some later, unrelated GET request.
 *
 * A bill is `verified` only if:
 *   1. the vendor's self-reported amountClaimed matches the disbursement's
 *      amount, AND
 *   2. if OCR ran (it's optional -- see extractReceiptData's fail-open
 *      contract), the receipt image was actually legible (confidence isn't
 *      'none'), an amount could be read off it, and that amount also
 *      matches amountClaimed.
 *
 * OCR only ever makes the check *stricter*, never looser: if OCR is
 * unavailable (ocr === null) the decision falls back to rule 1 alone, so the
 * app still works end-to-end without ML_SERVICE_URL configured. If OCR did
 * run and disagrees, that overrides an otherwise-matching amountClaimed.
 */
export function determineFinalStatus(
  amountClaimed: number,
  disbursementAmount: number,
  ocr: OcrResult | null
): 'verified' | 'under_review' {
  const claimMatchesDisbursement = Math.abs(amountClaimed - disbursementAmount) < AMOUNT_EPSILON;
  if (!claimMatchesDisbursement) return 'under_review';

  if (!ocr) return 'verified';
  if (ocr.confidence === 'none') return 'under_review';
  if (ocr.extractedAmount == null) return 'under_review';

  const ocrMatchesClaim = Math.abs(ocr.extractedAmount - amountClaimed) < AMOUNT_EPSILON;
  return ocrMatchesClaim ? 'verified' : 'under_review';
}
