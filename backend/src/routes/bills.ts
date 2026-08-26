import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { withTransaction } from '../db/pool';
import { appendLedgerEntry } from '../utils/ledger';
import { authMiddleware, requireRole } from '../middleware/auth';
import { extractReceiptData } from '../utils/ocrClient';
import { reconcileDisbursementStatus } from '../utils/verification';

const router = Router();

// POST /api/bills — vendor — {disbursementId, fileBase64, mimeType, amountClaimed} -> {bill}
router.post('/', authMiddleware, requireRole('vendor'), async (req, res) => {
  const { disbursementId, fileBase64, mimeType, amountClaimed } = req.body ?? {};
  const numericAmountClaimed = Number(amountClaimed);

  if (!disbursementId || !fileBase64 || !mimeType || !numericAmountClaimed) {
    return res.status(400).json({ error: 'disbursementId, fileBase64, mimeType, and amountClaimed are required' });
  }

  try {
    const { bill } = await withTransaction(async (client) => {
      const disbursementRes = await client.query(`SELECT * FROM disbursements WHERE id = $1 FOR UPDATE`, [
        disbursementId,
      ]);
      const disbursement = disbursementRes.rows[0];
      if (!disbursement) throw Object.assign(new Error('Disbursement not found'), { httpStatus: 404 });
      if (disbursement.vendor_id !== req.user!.userId) {
        throw Object.assign(new Error('This disbursement is not assigned to you'), { httpStatus: 403 });
      }

      const fileBuffer = Buffer.from(fileBase64, 'base64');

      const billRes = await client.query(
        `INSERT INTO bills (disbursement_id, vendor_id, file_data, file_mime_type, amount_claimed)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, disbursement_id, vendor_id, file_mime_type, amount_claimed, uploaded_at`,
        [disbursementId, req.user!.userId, fileBuffer, mimeType, numericAmountClaimed]
      );

      await client.query(`UPDATE disbursements SET status = 'pending_review' WHERE id = $1`, [disbursementId]);

      await appendLedgerEntry(client, 'bill_upload', billRes.rows[0].id, {
        disbursementId,
        vendorId: req.user!.userId,
        amountClaimed: numericAmountClaimed,
      });

      return { bill: billRes.rows[0] };
    });

    res.status(201).json({ bill });

    // Fire-and-forget: OCR reads the actual receipt image as a cross-check
    // against the vendor's self-reported amountClaimed, independent of and
    // after the upload response -- a slow/failed vision-model call never
    // delays or fails the upload itself. reconcileDisbursementStatus() then
    // decides the final status by ALSO checking the payout leg (see
    // routes/disbursements.ts) -- this bill/OCR check alone is necessary but
    // not sufficient for 'verified' now that a bank payout is required too.
    waitUntil(
      (async () => {
        try {
          const ocr = await extractReceiptData(fileBase64, mimeType);

          await withTransaction(async (client) => {
            if (ocr) {
              const mismatch =
                ocr.extractedAmount != null ? Math.abs(ocr.extractedAmount - numericAmountClaimed) >= 0.01 : null;
              await client.query(
                `INSERT INTO bill_ocr_results (bill_id, extracted_amount, vendor_name, receipt_date, confidence, amount_mismatch)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (bill_id) DO UPDATE SET
                   extracted_amount = EXCLUDED.extracted_amount,
                   vendor_name = EXCLUDED.vendor_name,
                   receipt_date = EXCLUDED.receipt_date,
                   confidence = EXCLUDED.confidence,
                   amount_mismatch = EXCLUDED.amount_mismatch`,
                [bill.id, ocr.extractedAmount, ocr.vendorName, ocr.date, ocr.confidence, mismatch]
              );
            }

            await reconcileDisbursementStatus(client, disbursementId);
          });
        } catch (err) {
          console.error('OCR/verification background step failed:', err);
        }
      })()
    );
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'A bill has already been uploaded for this disbursement' });
    if (err?.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    console.error('upload bill error:', err);
    res.status(500).json({ error: 'Failed to upload bill' });
  }
});

export default router;
