import { Router } from 'express';
import { pool } from '../db/pool';
import { publicLookupRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/verify/:verificationCode — public — reveals the bill linked to a Verification Code
router.get('/:verificationCode', publicLookupRateLimiter, async (req, res) => {
  try {
    const disbursementRes = await pool.query(
      `SELECT d.*, n.name AS ngo_name FROM disbursements d
       JOIN ngos n ON n.id = d.ngo_id
       WHERE d.verification_code = $1`,
      [req.params.verificationCode]
    );
    const disbursement = disbursementRes.rows[0];
    if (!disbursement) return res.status(404).json({ error: 'No disbursement found for that verification code' });

    const billRes = await pool.query(`SELECT * FROM bills WHERE disbursement_id = $1`, [disbursement.id]);
    const bill = billRes.rows[0];

    const ocrRes = bill
      ? await pool.query(`SELECT * FROM bill_ocr_results WHERE bill_id = $1`, [bill.id])
      : null;
    const ocr = ocrRes?.rows[0] ?? null;

    const payoutRes = await pool.query(`SELECT * FROM payouts WHERE disbursement_id = $1`, [disbursement.id]);
    const payout = payoutRes.rows[0] ?? null;

    const amountMatch = bill ? Number(bill.amount_claimed) === Number(disbursement.amount) : null;

    // Purely a read -- this endpoint no longer decides or writes status.
    // That decision (verified vs. under_review) is made once, as part of the
    // vendor's own bill-upload transaction, by the background OCR step in
    // routes/bills.ts (see utils/verification.ts's determineFinalStatus).
    // Until that background step finishes, this will still correctly show
    // 'pending_review' -- there's nothing here to promote it early.

    res.json({
      disbursement: {
        id: disbursement.id,
        ngoName: disbursement.ngo_name,
        amount: disbursement.amount,
        purpose: disbursement.purpose,
        category: disbursement.category,
        status: disbursement.status,
        underfunded: disbursement.underfunded,
        createdAt: disbursement.created_at,
      },
      bill: bill
        ? {
            amountClaimed: bill.amount_claimed,
            mimeType: bill.file_mime_type,
            fileBase64: bill.file_data.toString('base64'),
            uploadedAt: bill.uploaded_at,
          }
        : null,
      amountMatch, // false is never silently hidden — always a first-class field
      // OCR reads the actual receipt image independently of the vendor's
      // self-reported amountClaimed above -- null until the background
      // extraction (see routes/bills.ts) finishes, which can be a few
      // seconds after the bill upload itself.
      ocr: ocr
        ? {
            extractedAmount: ocr.extracted_amount,
            vendorName: ocr.vendor_name,
            date: ocr.receipt_date,
            confidence: ocr.confidence,
            amountMismatch: ocr.amount_mismatch,
          }
        : null,
      // Confirms funds actually moved to the vendor's bank account -- required
      // (alongside the bill/OCR check above) for 'verified' status; see
      // utils/verification.ts's reconcileDisbursementStatus. null means no
      // payout has been triggered yet (no bank account on file for the vendor).
      payout: payout
        ? { status: payout.status, failureReason: payout.failure_reason, completedAt: payout.completed_at }
        : null,
    });
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

export default router;
