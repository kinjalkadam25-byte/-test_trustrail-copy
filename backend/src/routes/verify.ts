import { Router } from 'express';
import { pool } from '../db/pool';

const router = Router();

// GET /api/verify/:verificationCode — public — reveals the bill linked to a Verification Code
router.get('/:verificationCode', async (req, res) => {
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

    const amountMatch = bill ? Number(bill.amount_claimed) === Number(disbursement.amount) : null;

    // Neither the 8-Phase Plan nor the Technical Architecture doc names an
    // explicit action that ever sets status = 'verified' — §5.4 describes this
    // endpoint as a read-only lookup, but nothing else transitions the status
    // enum's 'verified' value either, which left it permanently unreachable
    // (dashboards/trust-score would always show 0% verified). The natural
    // reading of "Verification Flow" is that a successful check IS what
    // verifies a disbursement, so this promotes status here — but only out of
    // 'pending_review', so it never overrides a platform admin's manual
    // 'under_review' call from the flag queue.
    let status = disbursement.status;
    if (status === 'pending_review' && bill) {
      status = amountMatch ? 'verified' : 'under_review';
      await pool.query(`UPDATE disbursements SET status = $1 WHERE id = $2`, [status, disbursement.id]);
    }

    res.json({
      disbursement: {
        id: disbursement.id,
        ngoName: disbursement.ngo_name,
        amount: disbursement.amount,
        purpose: disbursement.purpose,
        category: disbursement.category,
        status,
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
    });
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

export default router;
