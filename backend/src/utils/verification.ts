import type { PoolClient } from 'pg';
import { withUniqueCode } from './codes';
import { appendLedgerEntry } from './ledger';
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

/**
 * The bill/OCR check (determineFinalStatus above) and the payout to the
 * vendor's bank account (utils/payoutClient.ts) complete independently and
 * in either order -- this is called after EACH one finishes, re-checks the
 * other's current state, and only writes a status once both agree. Whichever
 * of the two finishes second is the one that actually flips the disbursement.
 *
 * Only ever touches a disbursement that's still `pending_review`: if it's
 * already `verified` this no-ops (nothing to reconsider), and if it's
 * `under_review` this also no-ops -- both possible either from an earlier
 * run of this same function (a genuine bill/payout failure, which shouldn't
 * be silently reopened by a late-arriving success on the other leg) or from
 * a platform admin's manual review-queue call (routes/admin.ts), which this
 * must never override.
 *
 * The disbursement's verification_code (nullable -- see schema.sql) is
 * assigned right here, the moment finalStatus resolves to 'verified' -- not
 * at disbursement creation. An under_review disbursement never gets one.
 */
export async function reconcileDisbursementStatus(client: PoolClient, disbursementId: string): Promise<void> {
  const disbursementRes = await client.query(`SELECT * FROM disbursements WHERE id = $1 FOR UPDATE`, [
    disbursementId,
  ]);
  const disbursement = disbursementRes.rows[0];
  if (!disbursement || disbursement.status !== 'pending_review') return;

  const billRes = await client.query(`SELECT * FROM bills WHERE disbursement_id = $1`, [disbursementId]);
  const bill = billRes.rows[0];
  if (!bill) return; // no bill yet -- shouldn't be pending_review, but nothing to reconcile either way

  const ocrRes = await client.query(`SELECT * FROM bill_ocr_results WHERE bill_id = $1`, [bill.id]);
  const ocrRow = ocrRes.rows[0];
  const ocr: OcrResult | null = ocrRow
    ? {
        extractedAmount: ocrRow.extracted_amount != null ? Number(ocrRow.extracted_amount) : null,
        vendorName: ocrRow.vendor_name,
        date: ocrRow.receipt_date,
        confidence: ocrRow.confidence,
      }
    : null;

  const billDecision = determineFinalStatus(Number(bill.amount_claimed), Number(disbursement.amount), ocr);

  const payoutRes = await client.query(`SELECT * FROM payouts WHERE disbursement_id = $1`, [disbursementId]);
  const payout = payoutRes.rows[0];

  let finalStatus: 'verified' | 'under_review' | null;
  if (billDecision === 'under_review') {
    finalStatus = 'under_review'; // bad bill data is decisive regardless of payout state
  } else if (!payout) {
    finalStatus = null; // vendor has no bank account on file / payout never triggered -- can't verify yet
  } else if (payout.status === 'failed') {
    finalStatus = 'under_review'; // funds never reached the vendor -- cannot be legit
  } else if (payout.status === 'success') {
    finalStatus = 'verified';
  } else {
    finalStatus = null; // payout still processing -- wait for it
  }

  if (finalStatus === null) return;

  // The verification code is assigned HERE, not at disbursement creation --
  // it doesn't exist at all until both the bill/OCR check and the bank
  // payout have independently succeeded. under_review disbursements never
  // get one from this path.
  let verificationCode: string | null = disbursement.verification_code ?? null;
  if (finalStatus === 'verified' && !verificationCode) {
    await withUniqueCode(async (code) => {
      await client.query(`UPDATE disbursements SET verification_code = $1 WHERE id = $2`, [code, disbursementId]);
      verificationCode = code;
    });
  }

  await client.query(`UPDATE disbursements SET status = $1 WHERE id = $2`, [finalStatus, disbursementId]);
  await appendLedgerEntry(client, 'verification', bill.id, {
    disbursementId,
    amountClaimed: Number(bill.amount_claimed),
    disbursementAmount: Number(disbursement.amount),
    ocrRan: Boolean(ocr),
    ocrConfidence: ocr?.confidence ?? null,
    ocrExtractedAmount: ocr?.extractedAmount ?? null,
    payoutStatus: payout?.status ?? null,
    finalStatus,
    verificationCode,
  });
}
